import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  completeDiagnosticRun,
  createDiagnosticLink,
  downloadProfileExport,
  endSession,
  fetchDiagnosticTexts,
  fetchSourceAdminStatus,
  fetchSourceReviewQueue,
  fetchChildSettings,
  fetchProfile,
  fetchTexts,
  getParentAuthStatus,
  loginParent,
  logoutParent,
  reviewSourceCandidate,
  resolveDiagnosticToken,
  saveDiagnosticAdultObservation,
  sendSessionEvents,
  syncSourceCandidates,
  startDiagnosticRun,
  startSession,
  updateChildSettings,
} from './lib/api';
import {
  enqueueSession,
  getMeta,
  getProfile,
  getTextsByLanguage,
  listQueuedSessions,
  putProfile,
  putTexts,
  removeQueuedSession,
  setMeta,
} from './lib/db';
import {
  defaultProfile,
  normalizeProfile,
  toPublicProfile,
  updateProfileFromSummary,
} from './lib/profile';

const BASE_PATH = (import.meta.env.BASE_URL || '/ukraine/').replace(/\/$/, '');
const TODAY_META_KEY = 'today_progress';
const RECENT_TEXT_META_KEY = 'recent_text_ids';
const DIAGNOSTIC_PASSAGES_DEFAULT = 3;
const DIAGNOSTIC_QUESTIONS_DEFAULT = 2;
const DEFAULT_CHILD_SETTINGS = {
  language_schedule: 'alternate',
  single_language: 'ru',
  alternate_start_language: 'ru',
};
const DEFAULT_ADULT_OBSERVATION = {
  hesitation_level: 'none',
  decoding_support: 'none',
  confidence: 'high',
  attention: 'steady',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createEvent(type, payload = {}) {
  return {
    event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    type,
    payload,
    ts: new Date().toISOString(),
  };
}

function getRouteFromPathname(pathname) {
  const normalized = pathname.replace(/\/+$/, '');
  if (normalized.endsWith('/profile')) {
    return 'profile';
  }
  if (normalized.endsWith('/diagnostic')) {
    return 'diagnostic';
  }
  return 'home';
}

function getDiagnosticTokenFromSearch(search) {
  return new URLSearchParams(search).get('token')?.trim() || '';
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeLanguage(language) {
  return language === 'uk' ? 'uk' : 'ru';
}

function normalizeChildSettings(settings) {
  const safe = settings && typeof settings === 'object' ? settings : {};
  const schedule = ['alternate', 'single', 'both'].includes(safe.language_schedule)
    ? safe.language_schedule
    : DEFAULT_CHILD_SETTINGS.language_schedule;

  return {
    ...DEFAULT_CHILD_SETTINGS,
    ...safe,
    language_schedule: schedule,
    single_language: normalizeLanguage(safe.single_language || DEFAULT_CHILD_SETTINGS.single_language),
    alternate_start_language: normalizeLanguage(
      safe.alternate_start_language || DEFAULT_CHILD_SETTINGS.alternate_start_language,
    ),
  };
}

function getScheduledLanguage(settings, date = new Date()) {
  const safe = normalizeChildSettings(settings);
  if (safe.language_schedule === 'single') {
    return safe.single_language;
  }
  if (safe.language_schedule === 'both') {
    return null;
  }

  const startLanguage = safe.alternate_start_language;
  const utcDays = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  const isEvenDay = utcDays % 2 === 0;

  if (startLanguage === 'ru') {
    return isEvenDay ? 'ru' : 'uk';
  }
  return isEvenDay ? 'uk' : 'ru';
}

function countWords(paragraphs) {
  if (!Array.isArray(paragraphs)) return 0;

  const text = paragraphs.join(' ');
  const words = text.match(/[\p{L}\p{M}'’-]+/gu);
  return words ? words.length : 0;
}

function tokenizeParagraph(paragraph) {
  return paragraph.match(/[\p{L}\p{M}'’-]+|[^\p{L}\p{M}\s]+|\s+/gu) || [paragraph];
}

function speakText(text, language) {
  if (!window.speechSynthesis || !text) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'uk' ? 'uk-UA' : 'ru-RU';
  utterance.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function chooseTextForSession(texts, profile, recentIds) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return null;
  }

  const skill = Number(profile?.skill_level) || 25;
  const comfort = texts.filter((text) => {
    const diff = Number(text.difficulty_score) || 0;
    return diff >= (skill - 6) && diff <= (skill + 4);
  });

  const instructional = texts.filter((text) => {
    const diff = Number(text.difficulty_score) || 0;
    return diff > (skill + 4) && diff <= (skill + 12);
  });

  const mix = profile?.recommended?.daily_plan?.mix || { comfort: 0.7, instructional: 0.3 };
  const useInstructional = Math.random() < (mix.instructional || 0.3);

  let pool = useInstructional ? instructional : comfort;
  if (pool.length === 0) {
    pool = comfort.length > 0 ? comfort : texts;
  }

  const unseen = pool.filter((text) => !recentIds.includes(text.id));
  const source = unseen.length > 0 ? unseen : pool;

  return source[Math.floor(Math.random() * source.length)];
}

function chooseDiagnosticText(texts, targetDifficulty, usedIds) {
  const available = (Array.isArray(texts) ? texts : []).filter((text) => !usedIds.includes(text.id));
  const source = available.length > 0 ? available : (Array.isArray(texts) ? texts : []);

  if (source.length === 0) {
    return null;
  }

  const sorted = [...source].sort((a, b) => {
    const diffA = Math.abs((Number(a.difficulty_score) || 0) - targetDifficulty);
    const diffB = Math.abs((Number(b.difficulty_score) || 0) - targetDifficulty);
    return diffA - diffB;
  });

  return sorted[0];
}

function formatBand(band) {
  if (!Array.isArray(band) || band.length !== 2) {
    return 'n/a';
  }
  return `${Number(band[0]).toFixed(1)} - ${Number(band[1]).toFixed(1)}`;
}

function formatTimestamp(isoString) {
  if (!isoString) {
    return 'n/a';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'n/a';
  }

  return date.toLocaleString();
}

function scoreBehaviorFromSummary(summary) {
  const help = clamp((Number(summary.help_taps_per_100_words) || 0) / 12, 0, 1);
  const repeat = clamp(Number(summary.repeat_rate) || 0, 0, 1);
  const pause = clamp(Number(summary.pause_density) || 0, 0, 1);
  const abandon = clamp(Number(summary.abandon_rate) || 0, 0, 1);
  const pace = clamp((Number(summary.pace_wpm_proxy) || 60) / 120, 0, 1);

  const strugglePenalty = (help * 0.35) + (repeat * 0.2) + (pause * 0.2) + (abandon * 0.25);
  const paceContribution = pace * 0.2;

  return clamp(1 - strugglePenalty + paceContribution, 0, 1);
}

function scoreDiagnosticPerformance(summary) {
  const behavior = scoreBehaviorFromSummary(summary);
  const comprehension = clamp(Number(summary.quiz_accuracy) || 0, 0, 1);
  return clamp((comprehension * 0.7) + (behavior * 0.3), 0, 1);
}

function getNextDiagnosticDifficulty(currentDifficulty, performance) {
  const difficulty = Number(currentDifficulty) || 25;
  if (performance >= 0.8) {
    return clamp(difficulty + 6, 0, 100);
  }
  if (performance >= 0.6) {
    return clamp(difficulty + 2, 0, 100);
  }
  if (performance >= 0.4) {
    return clamp(difficulty - 2, 0, 100);
  }
  return clamp(difficulty - 6, 0, 100);
}

function ChallengeDots({ done, target }) {
  return (
    <div className="dots-row" aria-label="daily progress">
      {Array.from({ length: target }).map((_, index) => (
        <span
          key={`dot-${index}`}
          className={`dot ${index < done ? 'done' : ''}`}
        />
      ))}
    </div>
  );
}

function App() {
  const [appReady, setAppReady] = useState(false);
  const [parentAuthed, setParentAuthed] = useState(false);
  const [parentPin, setParentPin] = useState('');
  const [parentPinError, setParentPinError] = useState('');
  const [parentPinBusy, setParentPinBusy] = useState(false);
  const [childSettings, setChildSettings] = useState(DEFAULT_CHILD_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('');
  const [sourceStatus, setSourceStatus] = useState(null);
  const [sourceQueue, setSourceQueue] = useState([]);
  const [sourceSyncBusy, setSourceSyncBusy] = useState(false);
  const [sourceQueueBusy, setSourceQueueBusy] = useState(false);
  const [sourceActionBusyId, setSourceActionBusyId] = useState('');
  const [sourceStatusMessage, setSourceStatusMessage] = useState('');

  const [route, setRoute] = useState(() => getRouteFromPathname(window.location.pathname));
  const [locationSearch, setLocationSearch] = useState(window.location.search);
  const [playScreen, setPlayScreen] = useState('home');
  const [language, setLanguage] = useState('ru');

  const [profiles, setProfiles] = useState({
    ru: toPublicProfile(defaultProfile('ru'), 'ru'),
    uk: toPublicProfile(defaultProfile('uk'), 'uk'),
  });

  const [_textsByLanguage, setTextsByLanguage] = useState({ ru: [], uk: [] });
  const [currentText, setCurrentText] = useState(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizLocked, setQuizLocked] = useState(false);

  const [statusMessage, setStatusMessage] = useState('');
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [todayProgress, setTodayProgress] = useState({ key: getTodayKey(), done: 0, target: 4 });

  const [diagnosticLink, setDiagnosticLink] = useState(null);
  const [diagnosticLinkBusy, setDiagnosticLinkBusy] = useState(false);
  const [diagnosticLinkError, setDiagnosticLinkError] = useState('');
  const [diagnosticLinkCopied, setDiagnosticLinkCopied] = useState('');

  const [diagToken, setDiagToken] = useState('');
  const [diagStatus, setDiagStatus] = useState('idle');
  const [diagError, setDiagError] = useState('');
  const [diagRunId, setDiagRunId] = useState(null);
  const [diagLinkId, setDiagLinkId] = useState(null);
  const [diagLanguages, setDiagLanguages] = useState(['ru', 'uk']);
  const [diagLanguageIndex, setDiagLanguageIndex] = useState(0);
  const [diagPassagesPerLanguage, setDiagPassagesPerLanguage] = useState(DIAGNOSTIC_PASSAGES_DEFAULT);
  const [diagQuestionsPerPassage, setDiagQuestionsPerPassage] = useState(DIAGNOSTIC_QUESTIONS_DEFAULT);
  const [diagStartingSkillByLanguage, setDiagStartingSkillByLanguage] = useState({ ru: 25, uk: 25 });
  const [diagTextPools, setDiagTextPools] = useState({ ru: [], uk: [] });
  const [diagUsedTextIds, setDiagUsedTextIds] = useState({ ru: [], uk: [] });
  const [diagCurrentDifficulty, setDiagCurrentDifficulty] = useState(25);
  const [diagCurrentText, setDiagCurrentText] = useState(null);
  const [diagQuizIndex, setDiagQuizIndex] = useState(0);
  const [diagQuizAnswers, setDiagQuizAnswers] = useState([]);
  const [diagQuizLocked, setDiagQuizLocked] = useState(false);
  const [diagPassageResults, setDiagPassageResults] = useState({ ru: [], uk: [] });
  const [diagSummary, setDiagSummary] = useState(null);
  const [diagAdultObservation, setDiagAdultObservation] = useState(DEFAULT_ADULT_OBSERVATION);

  const sessionRef = useRef(null);
  const flushingRef = useRef(false);
  const diagMetricsRef = useRef(null);

  const scheduledLanguage = useMemo(() => getScheduledLanguage(childSettings), [childSettings]);
  const activeLanguage = childSettings.language_schedule === 'both'
    ? language
    : (scheduledLanguage || language);
  const activeProfile = useMemo(
    () => normalizeProfile(profiles[activeLanguage], activeLanguage),
    [activeLanguage, profiles],
  );
  const dailyTarget = Math.max(3, Math.min(6, Number(activeProfile?.recommended?.daily_plan?.challenges_per_day) || 4));
  const diagCurrentLanguage = diagLanguages[diagLanguageIndex] || 'ru';

  const navigate = useCallback((nextRoute) => {
    const path = nextRoute === 'profile' ? `${BASE_PATH}/profile` : `${BASE_PATH}/`;
    window.history.pushState({}, '', path);
    setRoute(nextRoute);
    setLocationSearch('');
  }, []);

  const saveTodayProgress = useCallback(async (next) => {
    setTodayProgress(next);
    await setMeta(TODAY_META_KEY, next);
  }, []);

  const incrementTodayProgress = useCallback(async () => {
    const currentDay = getTodayKey();
    const currentTarget = Math.max(3, Math.min(6, Number(activeProfile?.recommended?.daily_plan?.challenges_per_day) || 4));

    if (todayProgress.key !== currentDay) {
      await saveTodayProgress({ key: currentDay, done: 1, target: currentTarget });
      return;
    }

    await saveTodayProgress({
      key: todayProgress.key,
      done: todayProgress.done + 1,
      target: currentTarget,
    });
  }, [activeProfile, saveTodayProgress, todayProgress]);

  const refreshProfilesFromServer = useCallback(async () => {
    if (!parentAuthed || !isOnline) {
      return;
    }

    try {
      const [ruProfile, ukProfile] = await Promise.all([
        fetchProfile('ru'),
        fetchProfile('uk'),
      ]);

      const nextProfiles = {
        ru: toPublicProfile(normalizeProfile(ruProfile, 'ru'), 'ru'),
        uk: toPublicProfile(normalizeProfile(ukProfile, 'uk'), 'uk'),
      };

      setProfiles(nextProfiles);
      await Promise.all([
        putProfile('ru', nextProfiles.ru),
        putProfile('uk', nextProfiles.uk),
      ]);
    } catch (error) {
      if (error.status === 401) {
        setParentAuthed(false);
      }
      console.warn('[ukraine] Could not refresh profiles from server:', error);
    }
  }, [isOnline, parentAuthed]);

  const loadTextsForLanguage = useCallback(async (nextLanguage, skill) => {
    const cachedTexts = await getTextsByLanguage(nextLanguage);
    let result = cachedTexts;

    if (isOnline) {
      try {
        const response = await fetchTexts(nextLanguage, {
          min: Math.max(0, skill - 20),
          max: Math.min(100, skill + 20),
          limit: 50,
        });

        const fetchedTexts = Array.isArray(response?.texts) ? response.texts : [];
        if (fetchedTexts.length > 0) {
          await putTexts(fetchedTexts);
          result = fetchedTexts;
        }
      } catch (error) {
        console.warn('[ukraine] Could not fetch texts from server:', error);
      }
    }

    if (result.length > 0) {
      setTextsByLanguage((prev) => ({ ...prev, [nextLanguage]: result }));
    }

    return result;
  }, [isOnline]);

  const flushQueue = useCallback(async () => {
    if (!isOnline || flushingRef.current) {
      return;
    }

    flushingRef.current = true;
    setSyncing(true);

    try {
      let queued = await listQueuedSessions();
      queued = queued.sort((a, b) => a.queue_id - b.queue_id);
      setPendingQueueCount(queued.length);

      for (const entry of queued) {
        try {
          const startResponse = await startSession({
            client_session_id: entry.local_session_id,
            language: entry.language,
            text_id: entry.text_id,
            challenge_type: entry.challenge_type,
            difficulty_score: entry.difficulty_score,
            start_ts: entry.start_ts,
          });

          await sendSessionEvents(startResponse.session_id, entry.events || []);

          const endResponse = await endSession(startResponse.session_id, {
            completed: entry.completed,
            end_ts: entry.end_ts,
            summary: entry.summary,
          });

          if (endResponse?.profile) {
            const lang = entry.language === 'uk' ? 'uk' : 'ru';
            setProfiles((prev) => ({ ...prev, [lang]: endResponse.profile }));
            await putProfile(lang, endResponse.profile);
          }

          await removeQueuedSession(entry.queue_id);
        } catch (error) {
          if (error.status === 429) {
            setStatusMessage('Sync paused due to rate limit. Try again soon.');
          }

          break;
        }
      }
    } finally {
      const remaining = await listQueuedSessions();
      setPendingQueueCount(remaining.length);
      setSyncing(false);
      flushingRef.current = false;
    }
  }, [isOnline]);

  const startDailyChallenge = useCallback(async () => {
    setStatusMessage('');

    const sessionLanguage = activeLanguage;
    const profile = normalizeProfile(profiles[sessionLanguage], sessionLanguage);
    const availableTexts = await loadTextsForLanguage(sessionLanguage, profile.skill_level);

    if (availableTexts.length === 0) {
      setStatusMessage('No stories available yet. Connect to internet and try again.');
      return;
    }

    const recentIds = (await getMeta(RECENT_TEXT_META_KEY)) || [];
    const picked = chooseTextForSession(availableTexts, profile, recentIds);

    if (!picked) {
      setStatusMessage('Could not build a challenge right now.');
      return;
    }

    const updatedRecent = [picked.id, ...recentIds.filter((id) => id !== picked.id)].slice(0, 15);
    await setMeta(RECENT_TEXT_META_KEY, updatedRecent);

    const startedAt = new Date().toISOString();
    sessionRef.current = {
      localSessionId: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt,
      language: sessionLanguage,
      textId: picked.id,
      difficulty: Number(picked.difficulty_score) || 25,
      events: [createEvent('SESSION_START', { text_id: picked.id, language: sessionLanguage })],
      lastInteractionMs: Date.now(),
      idleGapCount: 0,
      wordTapCount: 0,
      replayCount: 0,
      sentencePlayCount: 0,
      tapCountsByWord: {},
      quizCorrectCount: 0,
    };

    setCurrentText(picked);
    setLanguage(sessionLanguage);
    setQuizIndex(0);
    setQuizAnswers([]);
    setQuizLocked(false);
    setPlayScreen('reader');
  }, [activeLanguage, loadTextsForLanguage, profiles]);

  const recordInteraction = useCallback((type, payload = {}) => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    const nowMs = Date.now();
    if (nowMs - session.lastInteractionMs > 15000) {
      session.idleGapCount += 1;
    }
    session.lastInteractionMs = nowMs;
    session.events.push(createEvent(type, payload));
  }, []);

  const handleWordTap = useCallback((word) => {
    if (!word || !sessionRef.current) {
      return;
    }

    const session = sessionRef.current;
    const key = word.toLowerCase();

    recordInteraction('WORD_TAP', { word });
    session.wordTapCount += 1;
    session.tapCountsByWord[key] = (session.tapCountsByWord[key] || 0) + 1;

    if (session.tapCountsByWord[key] > 1) {
      session.replayCount += 1;
      session.events.push(createEvent('WORD_REPLAY', { word }));
    }

    speakText(word, session.language);
  }, [recordInteraction]);

  const handleSentencePlay = useCallback((sentence, sentenceIndex) => {
    if (!sentence || !sessionRef.current) {
      return;
    }

    const session = sessionRef.current;
    session.sentencePlayCount += 1;
    recordInteraction('SENTENCE_PLAY', { sentence_idx: sentenceIndex });
    speakText(sentence, session.language);
  }, [recordInteraction]);

  const finishSession = useCallback(async (completed = true) => {
    const session = sessionRef.current;
    if (!session || !currentText) {
      return;
    }
    const sessionLanguage = session.language === 'uk' ? 'uk' : 'ru';

    recordInteraction('SESSION_END', { completed, reason: completed ? 'completed' : 'abandoned' });

    const endedAt = new Date().toISOString();
    const durationSec = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000));
    const wordCount = countWords(currentText.paragraphs || []);

    const quizCount = Array.isArray(currentText.quiz) ? currentText.quiz.length : 0;
    const quizAccuracy = quizCount > 0 ? session.quizCorrectCount / quizCount : 0;

    const helpTapsPer100Words = wordCount > 0
      ? Number(((session.wordTapCount / wordCount) * 100).toFixed(2))
      : 0;

    const repeatRate = session.wordTapCount > 0
      ? Number((session.replayCount / session.wordTapCount).toFixed(3))
      : 0;

    const pauseDensity = Number(Math.min(1, session.idleGapCount / Math.max(1, durationSec / 60)).toFixed(3));
    const paceWpm = wordCount > 0
      ? Number((wordCount / (durationSec / 60)).toFixed(1))
      : 0;

    const ttsOnlyRatio = Number(Math.min(
      1,
      session.sentencePlayCount / Math.max(1, session.wordTapCount + Math.round(wordCount / 10)),
    ).toFixed(3));

    const summary = {
      duration_sec: durationSec,
      word_count: wordCount,
      quiz_accuracy: Number(quizAccuracy.toFixed(3)),
      quiz_count: quizCount,
      help_taps_per_100_words: helpTapsPer100Words,
      repeat_rate: repeatRate,
      pause_density: pauseDensity,
      abandon_rate: completed ? 0 : 1,
      pace_wpm_proxy: paceWpm,
      tts_only_ratio: ttsOnlyRatio,
      text_difficulty: Number(currentText.difficulty_score) || 25,
    };

    const previousProfile = normalizeProfile(profiles[sessionLanguage], sessionLanguage);
    const provisional = updateProfileFromSummary(previousProfile, summary, endedAt);
    const publicProvisional = toPublicProfile(provisional, sessionLanguage);

    setProfiles((prev) => ({ ...prev, [sessionLanguage]: publicProvisional }));
    await putProfile(sessionLanguage, publicProvisional);

    const queuePayload = {
      local_session_id: session.localSessionId,
      language: sessionLanguage,
      text_id: currentText.id,
      challenge_type: 'read_and_comprehension',
      difficulty_score: Number(currentText.difficulty_score) || 25,
      start_ts: session.startedAt,
      end_ts: endedAt,
      completed,
      events: session.events,
      summary,
    };

    await enqueueSession(queuePayload);
    const queued = await listQueuedSessions();
    setPendingQueueCount(queued.length);

    sessionRef.current = null;
    await incrementTodayProgress();

    setPlayScreen('celebrate');
    setCurrentText(null);
    setStatusMessage('Progress saved locally.');

    void flushQueue();
  }, [currentText, flushQueue, incrementTodayProgress, profiles, recordInteraction]);

  const submitQuizAnswer = useCallback(async (choiceIndex) => {
    if (!currentText || !Array.isArray(currentText.quiz)) {
      return;
    }

    if (quizLocked) {
      return;
    }

    const question = currentText.quiz[quizIndex];
    if (!question) {
      return;
    }

    setQuizLocked(true);

    const isCorrect = choiceIndex === question.answer_index;
    const answeredAt = Date.now();

    if (sessionRef.current) {
      if (isCorrect) {
        sessionRef.current.quizCorrectCount += 1;
      }

      sessionRef.current.events.push(createEvent('QUIZ_ANSWER', {
        question_id: question.id,
        choice_index: choiceIndex,
        correct: isCorrect,
        response_time_ms: answeredAt - new Date(sessionRef.current.startedAt).getTime(),
      }));
    }

    setQuizAnswers((prev) => {
      const next = [...prev];
      next[quizIndex] = {
        questionId: question.id,
        choiceIndex,
        correct: isCorrect,
      };
      return next;
    });

    window.setTimeout(async () => {
      if (quizIndex + 1 >= currentText.quiz.length) {
        await finishSession(true);
      } else {
        setQuizIndex((prev) => prev + 1);
        setQuizLocked(false);
      }
    }, 220);
  }, [currentText, finishSession, quizIndex, quizLocked]);

  const beginDiagnosticPassage = useCallback((nextLanguage, targetDifficulty, pools, usedIds) => {
    const languagePool = pools[nextLanguage] || [];
    const usedForLanguage = usedIds[nextLanguage] || [];
    const picked = chooseDiagnosticText(languagePool, targetDifficulty, usedForLanguage);

    if (!picked) {
      setDiagError('Could not find enough diagnostic stories for this language.');
      setDiagStatus('invalid');
      return null;
    }

    const nextUsedIds = {
      ...usedIds,
      [nextLanguage]: [...usedForLanguage, picked.id],
    };

    setDiagUsedTextIds(nextUsedIds);
    setDiagCurrentText(picked);
    setDiagCurrentDifficulty(Number(targetDifficulty) || 25);
    setDiagQuizIndex(0);
    setDiagQuizAnswers([]);
    setDiagQuizLocked(false);
    setDiagAdultObservation(DEFAULT_ADULT_OBSERVATION);
    setDiagStatus('reader');

    diagMetricsRef.current = {
      startedAt: new Date().toISOString(),
      lastInteractionMs: Date.now(),
      idleGapCount: 0,
      wordTapCount: 0,
      replayCount: 0,
      sentencePlayCount: 0,
      tapCountsByWord: {},
      quizCorrectCount: 0,
    };

    return nextUsedIds;
  }, []);

  const finalizeDiagnosticRun = useCallback(async (perLanguageResults) => {
    if (!diagRunId || !diagToken) {
      setDiagError('Diagnostic run is not active. Open a fresh link.');
      setDiagStatus('invalid');
      return;
    }

    setDiagStatus('finishing');

    try {
      const response = await completeDiagnosticRun(diagRunId, diagToken, {
        ru: { passages: perLanguageResults.ru || [] },
        uk: { passages: perLanguageResults.uk || [] },
      });

      if (response?.updated_profiles) {
        const nextProfiles = {
          ru: response.updated_profiles.ru,
          uk: response.updated_profiles.uk,
        };

        setProfiles(nextProfiles);
        await Promise.all([
          putProfile('ru', nextProfiles.ru),
          putProfile('uk', nextProfiles.uk),
        ]);
      }

      setDiagSummary(response?.diagnostic_summary || null);
      setDiagStatus('complete');
      setDiagError('');
    } catch {
      setDiagError('Could not finish diagnostic run. Please reopen the link and try again.');
      setDiagStatus('invalid');
    }
  }, [diagRunId, diagToken]);

  const finishDiagnosticPassage = useCallback(async () => {
    if (!diagCurrentText || !diagMetricsRef.current) {
      return;
    }

    const metrics = diagMetricsRef.current;
    const endedAt = new Date().toISOString();
    const durationSec = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(metrics.startedAt).getTime()) / 1000));
    const wordCount = countWords(diagCurrentText.paragraphs || []);
    const quizTotal = Math.min(diagQuestionsPerPassage, Array.isArray(diagCurrentText.quiz) ? diagCurrentText.quiz.length : 0);
    const quizAccuracy = quizTotal > 0 ? metrics.quizCorrectCount / quizTotal : 0;

    const helpTapsPer100Words = wordCount > 0
      ? Number(((metrics.wordTapCount / wordCount) * 100).toFixed(2))
      : 0;

    const repeatRate = metrics.wordTapCount > 0
      ? Number((metrics.replayCount / metrics.wordTapCount).toFixed(3))
      : 0;

    const pauseDensity = Number(Math.min(1, metrics.idleGapCount / Math.max(1, durationSec / 60)).toFixed(3));
    const paceWpm = wordCount > 0
      ? Number((wordCount / (durationSec / 60)).toFixed(1))
      : 0;

    const ttsOnlyRatio = Number(Math.min(
      1,
      metrics.sentencePlayCount / Math.max(1, metrics.wordTapCount + Math.round(wordCount / 10)),
    ).toFixed(3));

    const summary = {
      duration_sec: durationSec,
      word_count: wordCount,
      quiz_accuracy: Number(quizAccuracy.toFixed(3)),
      quiz_count: quizTotal,
      help_taps_per_100_words: helpTapsPer100Words,
      repeat_rate: repeatRate,
      pause_density: pauseDensity,
      abandon_rate: 0,
      pace_wpm_proxy: paceWpm,
      tts_only_ratio: ttsOnlyRatio,
      text_difficulty: Number(diagCurrentText.difficulty_score) || diagCurrentDifficulty,
    };

    const performance = scoreDiagnosticPerformance(summary);
    const passageIndex = (diagPassageResults[diagCurrentLanguage] || []).length;
    const passageResult = {
      text_id: diagCurrentText.id,
      difficulty_score: Number(diagCurrentText.difficulty_score) || diagCurrentDifficulty,
      summary,
      quiz_accuracy: summary.quiz_accuracy,
      passage_performance: Number(performance.toFixed(3)),
      adult_observations: { ...diagAdultObservation },
      completed_ts: endedAt,
    };

    const languageCode = diagCurrentLanguage;
    const updatedPerLanguage = {
      ...diagPassageResults,
      [languageCode]: [...(diagPassageResults[languageCode] || []), passageResult],
    };

    if (diagRunId && diagToken) {
      try {
        await saveDiagnosticAdultObservation(diagRunId, {
          token: diagToken,
          language: languageCode,
          passage_index: passageIndex,
          adult_observations: passageResult.adult_observations,
        });
      } catch (error) {
        console.warn('[ukraine] Could not persist intermediate adult observation:', error);
      }
    }

    setDiagPassageResults(updatedPerLanguage);
    setDiagCurrentText(null);
    diagMetricsRef.current = null;

    const completedCount = updatedPerLanguage[languageCode].length;
    if (completedCount < diagPassagesPerLanguage) {
      const nextDifficulty = getNextDiagnosticDifficulty(diagCurrentDifficulty, performance);
      beginDiagnosticPassage(languageCode, nextDifficulty, diagTextPools, diagUsedTextIds);
      return;
    }

    if (diagLanguageIndex + 1 < diagLanguages.length) {
      const nextLanguage = diagLanguages[diagLanguageIndex + 1];
      const nextDifficulty = Number(diagStartingSkillByLanguage[nextLanguage])
        || normalizeProfile(profiles[nextLanguage], nextLanguage).skill_level
        || 25;

      setDiagLanguageIndex((prev) => prev + 1);
      beginDiagnosticPassage(nextLanguage, nextDifficulty, diagTextPools, diagUsedTextIds);
      return;
    }

    await finalizeDiagnosticRun(updatedPerLanguage);
  }, [
    beginDiagnosticPassage,
    diagAdultObservation,
    diagCurrentDifficulty,
    diagCurrentLanguage,
    diagCurrentText,
    diagLanguageIndex,
    diagLanguages,
    diagPassageResults,
    diagPassagesPerLanguage,
    diagQuestionsPerPassage,
    diagRunId,
    diagStartingSkillByLanguage,
    diagToken,
    diagTextPools,
    diagUsedTextIds,
    finalizeDiagnosticRun,
    profiles,
  ]);

  const submitDiagnosticQuizAnswer = useCallback(async (choiceIndex) => {
    if (!diagCurrentText || diagStatus !== 'quiz' || diagQuizLocked) {
      return;
    }

    const questions = Array.isArray(diagCurrentText.quiz)
      ? diagCurrentText.quiz.slice(0, diagQuestionsPerPassage)
      : [];

    const question = questions[diagQuizIndex];
    if (!question) {
      return;
    }

    setDiagQuizLocked(true);

    const isCorrect = choiceIndex === question.answer_index;
    if (diagMetricsRef.current && isCorrect) {
      diagMetricsRef.current.quizCorrectCount += 1;
    }

    setDiagQuizAnswers((prev) => {
      const next = [...prev];
      next[diagQuizIndex] = {
        questionId: question.id,
        choiceIndex,
        correct: isCorrect,
      };
      return next;
    });

    window.setTimeout(async () => {
      if (diagQuizIndex + 1 >= questions.length) {
        setDiagQuizLocked(false);
        setDiagStatus('observation');
      } else {
        setDiagQuizIndex((prev) => prev + 1);
        setDiagQuizLocked(false);
      }
    }, 220);
  }, [diagCurrentText, diagQuestionsPerPassage, diagQuizIndex, diagQuizLocked, diagStatus]);

  const handleDiagnosticWordTap = useCallback((word) => {
    if (!word || !diagMetricsRef.current) {
      return;
    }

    const metrics = diagMetricsRef.current;
    const nowMs = Date.now();
    if (nowMs - metrics.lastInteractionMs > 15000) {
      metrics.idleGapCount += 1;
    }
    metrics.lastInteractionMs = nowMs;

    const key = word.toLowerCase();
    metrics.wordTapCount += 1;
    metrics.tapCountsByWord[key] = (metrics.tapCountsByWord[key] || 0) + 1;
    if (metrics.tapCountsByWord[key] > 1) {
      metrics.replayCount += 1;
    }

    speakText(word, diagCurrentLanguage);
  }, [diagCurrentLanguage]);

  const handleDiagnosticSentencePlay = useCallback((sentence) => {
    if (!sentence || !diagMetricsRef.current) {
      return;
    }

    const metrics = diagMetricsRef.current;
    const nowMs = Date.now();
    if (nowMs - metrics.lastInteractionMs > 15000) {
      metrics.idleGapCount += 1;
    }
    metrics.lastInteractionMs = nowMs;
    metrics.sentencePlayCount += 1;

    speakText(sentence, diagCurrentLanguage);
  }, [diagCurrentLanguage]);

  const startDiagnosticAssessment = useCallback(async () => {
    if (!diagToken) {
      setDiagError('Diagnostic token is missing from URL.');
      setDiagStatus('invalid');
      return;
    }

    if (!isOnline) {
      setDiagError('Internet connection is required to run diagnostics.');
      setDiagStatus('invalid');
      return;
    }

    setDiagError('');
    setDiagStatus('loading');

    try {
      const runStart = await startDiagnosticRun(diagToken);
      const languages = Array.isArray(runStart?.languages) && runStart.languages.length > 0
        ? runStart.languages
        : ['ru', 'uk'];

      const config = runStart?.config || {};
      const passagesPerLanguage = Number(config.passages_per_language) || DIAGNOSTIC_PASSAGES_DEFAULT;
      const questionsPerPassage = Number(config.questions_per_passage) || DIAGNOSTIC_QUESTIONS_DEFAULT;

      const textFetches = await Promise.all(
        languages.map(async (lang) => {
          const response = await fetchDiagnosticTexts(diagToken, lang, { limit: 80 });
          return [lang, Array.isArray(response?.texts) ? response.texts : []];
        }),
      );

      const pools = { ru: [], uk: [] };
      for (const [lang, texts] of textFetches) {
        pools[lang] = texts;
      }

      const startingSkills = {
        ru: Number(runStart?.starting_skill_by_language?.ru)
          || normalizeProfile(profiles.ru, 'ru').skill_level
          || 25,
        uk: Number(runStart?.starting_skill_by_language?.uk)
          || normalizeProfile(profiles.uk, 'uk').skill_level
          || 25,
      };

      setDiagRunId(runStart.run_id);
      setDiagLanguages(languages);
      setDiagPassagesPerLanguage(passagesPerLanguage);
      setDiagQuestionsPerPassage(questionsPerPassage);
      setDiagStartingSkillByLanguage(startingSkills);
      setDiagTextPools(pools);
      setDiagUsedTextIds({ ru: [], uk: [] });
      setDiagPassageResults({ ru: [], uk: [] });
      setDiagSummary(null);
      setDiagLanguageIndex(0);

      const firstLanguage = languages[0] || 'ru';
      const firstDifficulty = Number(startingSkills[firstLanguage]) || 25;
      beginDiagnosticPassage(firstLanguage, firstDifficulty, pools, { ru: [], uk: [] });
    } catch (error) {
      if (error.status === 429) {
        setDiagError('Too many attempts. Wait a few minutes and reopen the link.');
      } else {
        setDiagError('Could not start this diagnostic link. It may be expired or already used.');
      }
      setDiagStatus('invalid');
    }
  }, [beginDiagnosticPassage, diagToken, isOnline, profiles.ru, profiles.uk]);

  const handleParentLoginSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!parentPin.trim()) {
      setParentPinError('Enter PIN.');
      return;
    }

    setParentPinBusy(true);
    setParentPinError('');

    try {
      await loginParent(parentPin.trim());
      setParentPin('');
      setParentAuthed(true);
      await refreshProfilesFromServer();
    } catch (error) {
      if (error.status === 429) {
        const retry = Number(error.data?.retry_after_sec) || 600;
        setParentPinError(`Too many attempts. Try again in ${Math.ceil(retry / 60)} min.`);
      } else if (error.status === 401) {
        const remaining = error.data?.attempts_remaining;
        if (Number.isFinite(remaining)) {
          setParentPinError(`Wrong PIN. ${remaining} attempts left.`);
        } else {
          setParentPinError('Wrong PIN.');
        }
      } else {
        setParentPinError('PIN check failed. Try again.');
      }
    } finally {
      setParentPinBusy(false);
    }
  }, [parentPin, refreshProfilesFromServer]);

  const handleParentLogout = useCallback(async () => {
    try {
      await logoutParent();
    } catch {
      // Ignore network errors; clear local parent state anyway.
    }

    setParentAuthed(false);
    setParentPin('');
    setParentPinError('');
    setRoute('home');
    setPlayScreen('home');
    setLocationSearch('');
    window.history.pushState({}, '', `${BASE_PATH}/`);
  }, []);

  const handleSaveSettings = useCallback(async () => {
    if (!parentAuthed) {
      return;
    }

    setSettingsBusy(true);
    setSettingsStatus('');

    try {
      const response = await updateChildSettings(childSettings);
      const next = normalizeChildSettings(response?.settings || childSettings);
      setChildSettings(next);
      setSettingsStatus('Settings saved.');
    } catch (error) {
      if (error.status === 401) {
        setParentAuthed(false);
        setParentPinError('Parent session expired. Enter PIN again.');
      } else {
        setSettingsStatus('Could not save settings.');
      }
    } finally {
      setSettingsBusy(false);
    }
  }, [childSettings, parentAuthed]);

  const refreshSourceAdmin = useCallback(async () => {
    if (!parentAuthed) {
      return;
    }

    setSourceQueueBusy(true);
    try {
      const [statusRes, queueRes] = await Promise.all([
        fetchSourceAdminStatus(),
        fetchSourceReviewQueue({ status: 'pending', limit: 20 }),
      ]);
      setSourceStatus(statusRes || null);
      setSourceQueue(Array.isArray(queueRes?.items) ? queueRes.items : []);
    } catch (error) {
      if (error.status === 401) {
        setParentAuthed(false);
        setParentPinError('Parent session expired. Enter PIN again.');
      } else {
        setSourceStatusMessage('Could not refresh source admin data.');
      }
    } finally {
      setSourceQueueBusy(false);
    }
  }, [parentAuthed]);

  const handleSyncSources = useCallback(async () => {
    if (!parentAuthed) {
      return;
    }

    setSourceSyncBusy(true);
    setSourceStatusMessage('');
    try {
      const response = await syncSourceCandidates({
        source: 'gdl',
        languages: ['ru', 'uk'],
        per_language_limit: 6,
        min_words: 18,
        max_words: 180,
        dry_run: false,
      });
      const added = Number(response?.added) || 0;
      setSourceStatusMessage(`Sync complete. Added ${added} new candidate${added === 1 ? '' : 's'} to review queue.`);
      await refreshSourceAdmin();
    } catch (error) {
      if (error.status === 401) {
        setParentAuthed(false);
        setParentPinError('Parent session expired. Enter PIN again.');
      } else {
        setSourceStatusMessage('Source sync failed.');
      }
    } finally {
      setSourceSyncBusy(false);
    }
  }, [parentAuthed, refreshSourceAdmin]);

  const handleReviewSourceItem = useCallback(async (reviewId, action) => {
    if (!reviewId || !['approve', 'reject'].includes(action)) {
      return;
    }

    setSourceActionBusyId(reviewId);
    setSourceStatusMessage('');
    try {
      await reviewSourceCandidate(reviewId, { action });
      setSourceStatusMessage(action === 'approve' ? 'Candidate approved.' : 'Candidate rejected.');
      await refreshSourceAdmin();
    } catch (error) {
      if (error.status === 401) {
        setParentAuthed(false);
        setParentPinError('Parent session expired. Enter PIN again.');
      } else if (error.status === 409) {
        setSourceStatusMessage('Candidate is no longer pending.');
        await refreshSourceAdmin();
      } else {
        setSourceStatusMessage('Could not update review item.');
      }
    } finally {
      setSourceActionBusyId('');
    }
  }, [refreshSourceAdmin]);

  const handleExport = useCallback(async () => {
    try {
      const blob = await downloadProfileExport();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ukraine-profile-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (error.status === 401) {
        setParentAuthed(false);
        setParentPinError('Parent session expired. Enter PIN again.');
      } else {
        setStatusMessage('Could not export profile right now.');
      }
    }
  }, []);

  const handleCreateDiagnosticLink = useCallback(async () => {
    setDiagnosticLinkBusy(true);
    setDiagnosticLinkError('');
    setDiagnosticLinkCopied('');

    try {
      const response = await createDiagnosticLink({
        max_uses: 1,
        expires_hours: 24,
        languages: ['ru', 'uk'],
      });

      setDiagnosticLink({
        url: response.url,
        expiresTs: response.expires_ts,
      });
    } catch (error) {
      if (error.status === 401) {
        setParentAuthed(false);
        setParentPinError('Parent session expired. Enter PIN again.');
      }
      setDiagnosticLinkError('Could not create link right now.');
    } finally {
      setDiagnosticLinkBusy(false);
    }
  }, []);

  const handleCopyDiagnosticLink = useCallback(async () => {
    if (!diagnosticLink?.url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(diagnosticLink.url);
      setDiagnosticLinkCopied('Copied');
    } catch {
      setDiagnosticLinkCopied('Copy failed');
    }
  }, [diagnosticLink]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(getRouteFromPathname(window.location.pathname));
      setLocationSearch(window.location.search);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void flushQueue();
    };

    const onOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue]);

  useEffect(() => {
    if (isOnline) {
      void flushQueue();
    }
  }, [flushQueue, isOnline]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const cachedRuProfile = await getProfile('ru');
      const cachedUkProfile = await getProfile('uk');

      const mergedProfiles = {
        ru: toPublicProfile(normalizeProfile(cachedRuProfile || defaultProfile('ru'), 'ru'), 'ru'),
        uk: toPublicProfile(normalizeProfile(cachedUkProfile || defaultProfile('uk'), 'uk'), 'uk'),
      };

      const [cachedRuTexts, cachedUkTexts, queue, storedProgress, remoteSettings] = await Promise.all([
        getTextsByLanguage('ru'),
        getTextsByLanguage('uk'),
        listQueuedSessions(),
        getMeta(TODAY_META_KEY),
        fetchChildSettings().catch(() => ({ settings: DEFAULT_CHILD_SETTINGS })),
      ]);

      if (cancelled) {
        return;
      }

      setProfiles(mergedProfiles);
      setTextsByLanguage({ ru: cachedRuTexts, uk: cachedUkTexts });
      setPendingQueueCount(queue.length);
      setChildSettings(normalizeChildSettings(remoteSettings?.settings || DEFAULT_CHILD_SETTINGS));

      const todayKey = getTodayKey();
      if (storedProgress && storedProgress.key === todayKey) {
        setTodayProgress(storedProgress);
      } else {
        const fallbackProgress = { key: todayKey, done: 0, target: 4 };
        setTodayProgress(fallbackProgress);
        await setMeta(TODAY_META_KEY, fallbackProgress);
      }

      try {
        await Promise.all([
          loadTextsForLanguage('ru', mergedProfiles.ru.skill_level),
          loadTextsForLanguage('uk', mergedProfiles.uk.skill_level),
        ]);
        await flushQueue();
      } catch (error) {
        console.warn('[ukraine] Initial data warmup failed:', error);
      }

      try {
        const auth = await getParentAuthStatus();
        if (!cancelled) {
          setParentAuthed(Boolean(auth?.authenticated));
        }

        if (auth?.authenticated) {
          await refreshProfilesFromServer();
        }
      } catch (error) {
        console.warn('[ukraine] Parent auth status check failed:', error);
      } finally {
        if (!cancelled) {
          setAppReady(true);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [flushQueue, loadTextsForLanguage, refreshProfilesFromServer]);

  useEffect(() => {
    if (route !== 'diagnostic') {
      setDiagStatus('idle');
      return;
    }

    const token = getDiagnosticTokenFromSearch(locationSearch);
    setDiagToken(token);
    setDiagError('');

    if (!token) {
      setDiagStatus('invalid');
      setDiagError('Diagnostic token missing from URL.');
      return;
    }

    if (!isOnline) {
      setDiagStatus('invalid');
      setDiagError('Internet connection is required to run this diagnostic.');
      return;
    }

    let cancelled = false;

    async function initializeDiagnostic() {
      setDiagStatus('loading');
      try {
        const resolved = await resolveDiagnosticToken(token);
        if (cancelled) {
          return;
        }

        const languages = Array.isArray(resolved?.languages) && resolved.languages.length > 0
          ? resolved.languages
          : ['ru', 'uk'];

        const config = resolved?.config || {};
        setDiagLinkId(resolved.link_id || null);
        setDiagLanguages(languages);
        setDiagPassagesPerLanguage(Number(config.passages_per_language) || DIAGNOSTIC_PASSAGES_DEFAULT);
        setDiagQuestionsPerPassage(Number(config.questions_per_passage) || DIAGNOSTIC_QUESTIONS_DEFAULT);
        setDiagRunId(null);
        setDiagCurrentText(null);
        setDiagQuizAnswers([]);
        setDiagQuizIndex(0);
        setDiagQuizLocked(false);
        setDiagPassageResults({ ru: [], uk: [] });
        setDiagUsedTextIds({ ru: [], uk: [] });
        setDiagSummary(null);
        setDiagLanguageIndex(0);

        const poolEntries = await Promise.all(
          languages.map(async (lang) => {
            const response = await fetchDiagnosticTexts(token, lang, { limit: 80 });
            return [lang, Array.isArray(response?.texts) ? response.texts : []];
          }),
        );

        if (cancelled) {
          return;
        }

        const pools = { ru: [], uk: [] };
        for (const [lang, texts] of poolEntries) {
          pools[lang] = texts;
        }

        setDiagTextPools(pools);
        setDiagStatus('intro');
      } catch (error) {
        if (!cancelled) {
          setDiagStatus('invalid');
          if (error.status === 429) {
            setDiagError('Too many attempts. Retry in a few minutes.');
          } else {
            setDiagError('This diagnostic link is invalid, expired, or already used.');
          }
        }
      }
    }

    void initializeDiagnostic();

    return () => {
      cancelled = true;
    };
  }, [isOnline, locationSearch, route]);

  useEffect(() => {
    const todayKey = getTodayKey();
    if (todayProgress.key !== todayKey) {
      const next = { key: todayKey, done: 0, target: dailyTarget };
      void saveTodayProgress(next);
    }
  }, [dailyTarget, saveTodayProgress, todayProgress.key]);

  useEffect(() => {
    if (childSettings.language_schedule !== 'both' && scheduledLanguage && language !== scheduledLanguage) {
      setLanguage(scheduledLanguage);
    }
  }, [childSettings.language_schedule, language, scheduledLanguage]);

  useEffect(() => {
    if (route === 'profile' && parentAuthed) {
      void refreshSourceAdmin();
    }
  }, [parentAuthed, refreshSourceAdmin, route]);

  if (!appReady) {
    return (
      <div className="page-wrap">
        <div className="card loading-card">Preparing reading app...</div>
      </div>
    );
  }

  if (route === 'diagnostic') {
    const diagQuestions = Array.isArray(diagCurrentText?.quiz)
      ? diagCurrentText.quiz.slice(0, diagQuestionsPerPassage)
      : [];
    const diagQuestion = diagQuestions[diagQuizIndex] || null;

    return (
      <div className="page-wrap">
        <div className="app-shell">
          <header className="top-bar">
            <div>
              <h1>Bilingual Diagnostic</h1>
              <p>
                Link: {diagLinkId || 'n/a'}
                {' | '}
                {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
            <div className="top-bar-actions">
              <button className="ghost-btn" onClick={() => navigate('home')}>
                Back to Home
              </button>
            </div>
          </header>

          {diagError && <p className="status-text error-status">{diagError}</p>}

          <section className="content-card diagnostic-layout">
            {diagStatus === 'loading' && (
              <div className="diagnostic-stage">
                <h2>Preparing Diagnostic</h2>
                <p>Checking link and loading passages...</p>
              </div>
            )}

            {diagStatus === 'invalid' && (
              <div className="diagnostic-stage">
                <h2>Link Unavailable</h2>
                <p>{diagError || 'This diagnostic link cannot be used.'}</p>
              </div>
            )}

            {diagStatus === 'intro' && (
              <div className="diagnostic-stage">
                <h2>Start Diagnostic</h2>
                <p>
                  This assessment covers Russian and Ukrainian.
                  {' '}
                  {diagPassagesPerLanguage} passages per language.
                </p>
                <button className="primary-btn" onClick={() => void startDiagnosticAssessment()}>
                  Start Diagnostic
                </button>
              </div>
            )}

            {diagStatus === 'reader' && diagCurrentText && (
              <div className="reader-layout">
                <div className="reader-header">
                  <h2>
                    {diagCurrentLanguage === 'ru' ? 'Russian' : 'Ukrainian'} Diagnostic
                    {' - '}
                    Passage {(diagPassageResults[diagCurrentLanguage]?.length || 0) + 1}/{diagPassagesPerLanguage}
                  </h2>
                  <p>{diagCurrentText.title}</p>
                </div>

                <div className="reader-content">
                  {(diagCurrentText.paragraphs || []).map((paragraph, paragraphIndex) => (
                    <div key={`diag-p-${paragraphIndex}`} className="paragraph-block">
                      <button
                        className="sentence-play-btn"
                        onClick={() => handleDiagnosticSentencePlay(paragraph)}
                        aria-label="Play sentence"
                      >
                        Play Sentence
                      </button>

                      <p className="paragraph-text">
                        {tokenizeParagraph(paragraph).map((token, tokenIndex) => {
                          if (/^[\p{L}\p{M}'’-]+$/u.test(token)) {
                            return (
                              <button
                                key={`diag-token-${paragraphIndex}-${tokenIndex}`}
                                className="word-btn"
                                onClick={() => handleDiagnosticWordTap(token)}
                              >
                                {token}
                              </button>
                            );
                          }

                          return <span key={`diag-token-${paragraphIndex}-${tokenIndex}`}>{token}</span>;
                        })}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="reader-actions">
                  <button
                    className="primary-btn"
                    onClick={() => {
                      setDiagStatus('quiz');
                      setDiagQuizIndex(0);
                      setDiagQuizAnswers([]);
                      setDiagQuizLocked(false);
                    }}
                  >
                    Done Reading
                  </button>
                </div>
              </div>
            )}

            {diagStatus === 'quiz' && diagQuestion && (
              <div className="quiz-layout">
                <h2>Diagnostic Questions</h2>
                <p className="quiz-counter">
                  {diagCurrentLanguage === 'ru' ? 'Russian' : 'Ukrainian'}
                  {' | '}
                  Question {diagQuizIndex + 1} / {diagQuestions.length}
                </p>

                <article className="quiz-card">
                  <h3>{diagQuestion.prompt}</h3>
                  <div className="choices-grid">
                    {diagQuestion.choices.map((choice, choiceIndex) => {
                      const selected = diagQuizAnswers[diagQuizIndex]?.choiceIndex === choiceIndex;
                      const correct = diagQuizAnswers[diagQuizIndex]?.correct;

                      let extraClass = '';
                      if (selected && diagQuizLocked) {
                        extraClass = correct ? 'correct' : 'incorrect';
                      }

                      return (
                        <button
                          key={`diag-choice-${choice}`}
                          className={`choice-btn ${extraClass}`}
                          disabled={diagQuizLocked}
                          onClick={() => void submitDiagnosticQuizAnswer(choiceIndex)}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                </article>
              </div>
            )}

            {diagStatus === 'observation' && (
              <div className="diagnostic-stage">
                <h2>Adult Checkpoint</h2>
                <p>Quickly mark how this passage went before continuing.</p>

                <div className="observation-grid">
                  <div className="observation-row">
                    <strong>Hesitations</strong>
                    <div className="choices-grid">
                      {[
                        ['none', 'None'],
                        ['some', 'Some'],
                        ['many', 'Many'],
                      ].map(([value, label]) => (
                        <button
                          key={`obs-hes-${value}`}
                          className={`choice-btn ${diagAdultObservation.hesitation_level === value ? 'selected' : ''}`}
                          onClick={() => setDiagAdultObservation((prev) => ({ ...prev, hesitation_level: value }))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="observation-row">
                    <strong>Decoding Help</strong>
                    <div className="choices-grid">
                      {[
                        ['none', 'None'],
                        ['some', 'Some'],
                        ['frequent', 'Frequent'],
                      ].map(([value, label]) => (
                        <button
                          key={`obs-help-${value}`}
                          className={`choice-btn ${diagAdultObservation.decoding_support === value ? 'selected' : ''}`}
                          onClick={() => setDiagAdultObservation((prev) => ({ ...prev, decoding_support: value }))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="observation-row">
                    <strong>Confidence</strong>
                    <div className="choices-grid">
                      {[
                        ['high', 'High'],
                        ['medium', 'Medium'],
                        ['low', 'Low'],
                      ].map(([value, label]) => (
                        <button
                          key={`obs-confidence-${value}`}
                          className={`choice-btn ${diagAdultObservation.confidence === value ? 'selected' : ''}`}
                          onClick={() => setDiagAdultObservation((prev) => ({ ...prev, confidence: value }))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="observation-row">
                    <strong>Attention</strong>
                    <div className="choices-grid">
                      {[
                        ['steady', 'Steady'],
                        ['mixed', 'Mixed'],
                        ['wandering', 'Wandering'],
                      ].map(([value, label]) => (
                        <button
                          key={`obs-attention-${value}`}
                          className={`choice-btn ${diagAdultObservation.attention === value ? 'selected' : ''}`}
                          onClick={() => setDiagAdultObservation((prev) => ({ ...prev, attention: value }))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button className="primary-btn" onClick={() => void finishDiagnosticPassage()}>
                  Continue
                </button>
              </div>
            )}

            {diagStatus === 'finishing' && (
              <div className="diagnostic-stage">
                <h2>Finishing Diagnostic</h2>
                <p>Saving results and updating both language profiles...</p>
              </div>
            )}

            {diagStatus === 'complete' && (
              <div className="diagnostic-stage">
                <h2>Diagnostic Complete</h2>
                <p>Both Russian and Ukrainian profiles are updated.</p>

                <div className="diagnostic-summary-grid">
                  {['ru', 'uk'].map((lang) => {
                    const row = diagSummary?.[lang];
                    return (
                      <article key={`diag-summary-${lang}`} className="profile-card">
                        <h3>{lang === 'ru' ? 'Russian' : 'Ukrainian'}</h3>
                        <p><strong>Old Skill:</strong> {row?.old_skill ?? 'n/a'}</p>
                        <p><strong>New Skill:</strong> {row?.diagnostic_skill ?? 'n/a'}</p>
                        <p><strong>Delta:</strong> {row?.delta_skill ?? 'n/a'}</p>
                        <p><strong>Bottleneck:</strong> {row?.bottleneck ?? 'n/a'}</p>
                      </article>
                    );
                  })}
                </div>

                {parentAuthed && (
                  <button className="primary-btn" onClick={() => navigate('profile')}>
                    View Profile
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="app-shell">
        <header className="top-bar">
          <div>
            <h1>Ukraine Reading</h1>
            <p>
              {isOnline ? 'Online' : 'Offline'}
              {' | '}
              Queue: {pendingQueueCount}
              {' | '}
              {syncing ? 'Syncing...' : 'Idle'}
              {' | '}
              {childSettings.language_schedule === 'both'
                ? `Language: ${language === 'uk' ? 'Ukrainian' : 'Russian'}`
                : `Today: ${activeLanguage === 'uk' ? 'Ukrainian' : 'Russian'}`}
            </p>
          </div>
          <div className="top-bar-actions">
            {route === 'profile' ? (
              <button className="ghost-btn" onClick={() => navigate('home')}>
                Back to Child
              </button>
            ) : (
              <button className="ghost-btn" onClick={() => navigate('profile')}>
                Parent Area
              </button>
            )}
            {route === 'profile' && parentAuthed && (
              <button className="ghost-btn" onClick={() => void handleParentLogout()}>
                Parent Logout
              </button>
            )}
          </div>
        </header>

        {statusMessage && <p className="status-text">{statusMessage}</p>}

        {route === 'profile' ? (
          parentAuthed ? (
            <section className="content-card profile-layout">
              <article className="profile-card settings-card">
                <h3>Child Settings</h3>
                <p><strong>Schedule:</strong> {childSettings.language_schedule}</p>
                <div className="language-toggle" role="tablist" aria-label="Language schedule">
                  <button
                    className={`toggle-btn ${childSettings.language_schedule === 'alternate' ? 'active' : ''}`}
                    onClick={() => setChildSettings((prev) => ({ ...prev, language_schedule: 'alternate' }))}
                  >
                    Alternate
                  </button>
                  <button
                    className={`toggle-btn ${childSettings.language_schedule === 'both' ? 'active' : ''}`}
                    onClick={() => setChildSettings((prev) => ({ ...prev, language_schedule: 'both' }))}
                  >
                    Both Daily
                  </button>
                  <button
                    className={`toggle-btn ${childSettings.language_schedule === 'single' ? 'active' : ''}`}
                    onClick={() => setChildSettings((prev) => ({ ...prev, language_schedule: 'single' }))}
                  >
                    Single
                  </button>
                </div>

                {childSettings.language_schedule === 'alternate' && (
                  <>
                    <p><strong>Alternate Start:</strong> {childSettings.alternate_start_language === 'uk' ? 'Ukrainian' : 'Russian'}</p>
                    <div className="language-toggle">
                      <button
                        className={`toggle-btn ${childSettings.alternate_start_language === 'ru' ? 'active' : ''}`}
                        onClick={() => setChildSettings((prev) => ({ ...prev, alternate_start_language: 'ru' }))}
                      >
                        Start RU
                      </button>
                      <button
                        className={`toggle-btn ${childSettings.alternate_start_language === 'uk' ? 'active' : ''}`}
                        onClick={() => setChildSettings((prev) => ({ ...prev, alternate_start_language: 'uk' }))}
                      >
                        Start UK
                      </button>
                    </div>
                  </>
                )}

                {childSettings.language_schedule === 'single' && (
                  <>
                    <p><strong>Single Language:</strong> {childSettings.single_language === 'uk' ? 'Ukrainian' : 'Russian'}</p>
                    <div className="language-toggle">
                      <button
                        className={`toggle-btn ${childSettings.single_language === 'ru' ? 'active' : ''}`}
                        onClick={() => setChildSettings((prev) => ({ ...prev, single_language: 'ru' }))}
                      >
                        Russian
                      </button>
                      <button
                        className={`toggle-btn ${childSettings.single_language === 'uk' ? 'active' : ''}`}
                        onClick={() => setChildSettings((prev) => ({ ...prev, single_language: 'uk' }))}
                      >
                        Ukrainian
                      </button>
                    </div>
                  </>
                )}

                <div className="profile-actions">
                  <button className="primary-btn" onClick={() => void handleSaveSettings()} disabled={settingsBusy}>
                    {settingsBusy ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
                {settingsStatus && <p className="hint-text">{settingsStatus}</p>}
              </article>

              <article className="profile-card settings-card">
                <h3>Open Text Sources</h3>
                <p>Run source sync and review new candidate texts before publishing.</p>
                <p>
                  <strong>Pending:</strong> {sourceStatus?.queue_counts?.pending ?? 0}
                  {' | '}
                  <strong>Imported:</strong> {sourceStatus?.imported_text_count ?? 0}
                </p>
                {sourceStatus?.last_run && (
                  <p>
                    <strong>Last Sync:</strong> {formatTimestamp(sourceStatus.last_run.completed_ts || sourceStatus.last_run.started_ts)}
                    {' | '}
                    Added {sourceStatus.last_run.added || 0}
                  </p>
                )}

                <div className="profile-actions profile-actions-wrap">
                  <button className="ghost-btn" onClick={() => void refreshSourceAdmin()} disabled={sourceQueueBusy}>
                    {sourceQueueBusy ? 'Refreshing...' : 'Refresh Queue'}
                  </button>
                  <button className="primary-btn" onClick={() => void handleSyncSources()} disabled={sourceSyncBusy || !isOnline}>
                    {sourceSyncBusy ? 'Syncing...' : 'Sync GDL Sources'}
                  </button>
                </div>

                {sourceStatusMessage && <p className="hint-text">{sourceStatusMessage}</p>}

                {sourceQueue.length > 0 ? (
                  <div className="source-review-list">
                    {sourceQueue.slice(0, 6).map((item) => (
                      <article key={item.review_id} className="source-review-item">
                        <h4>{item.title}</h4>
                        <p>
                          <strong>{item.language === 'uk' ? 'Ukrainian' : 'Russian'}</strong>
                          {' | '}
                          {item.source_name}
                          {' | '}
                          Difficulty {Number(item.difficulty_score || 0).toFixed(1)}
                        </p>
                        <p>{Array.isArray(item.paragraphs) ? item.paragraphs[0] : ''}</p>
                        <div className="profile-actions profile-actions-wrap">
                          <button
                            className="primary-btn"
                            onClick={() => void handleReviewSourceItem(item.review_id, 'approve')}
                            disabled={sourceActionBusyId === item.review_id}
                          >
                            Approve
                          </button>
                          <button
                            className="ghost-btn"
                            onClick={() => void handleReviewSourceItem(item.review_id, 'reject')}
                            disabled={sourceActionBusyId === item.review_id}
                          >
                            Reject
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="hint-text">No pending candidates in review queue.</p>
                )}
              </article>

              <div className="profile-grid">
                {['ru', 'uk'].map((lang) => {
                  const profile = normalizeProfile(profiles[lang], lang);
                  return (
                    <article key={lang} className="profile-card">
                      <h2>{lang === 'ru' ? 'Russian (RU)' : 'Ukrainian (UK)'}</h2>
                      <p><strong>Skill:</strong> {profile.skill_level.toFixed(2)}</p>
                      <p><strong>Confidence:</strong> {(profile.confidence * 100).toFixed(0)}%</p>
                      <p><strong>Bottleneck:</strong> {profile.bottleneck}</p>
                      <p><strong>Comfort band:</strong> {formatBand(profile.comfort_band)}</p>
                      <p><strong>Instructional band:</strong> {formatBand(profile.instructional_band)}</p>
                      <p><strong>Trend 7d:</strong> {profile.trend_7d.toFixed(2)}</p>
                      <p><strong>Trend 30d:</strong> {profile.trend_30d.toFixed(2)}</p>
                      <p><strong>Suggested text types:</strong> {(profile.recommended?.text_types || []).join(', ')}</p>
                      <p><strong>Suggested activities:</strong> {(profile.recommended?.activities || []).join(', ')}</p>
                    </article>
                  );
                })}
              </div>

              <div className="profile-actions profile-actions-wrap">
                <button className="ghost-btn" onClick={() => void handleCreateDiagnosticLink()} disabled={diagnosticLinkBusy}>
                  {diagnosticLinkBusy ? 'Creating Link...' : 'Create Diagnostic Link'}
                </button>
                <button className="primary-btn" onClick={handleExport}>Export JSON</button>
              </div>

              {diagnosticLinkError && <p className="error-text">{diagnosticLinkError}</p>}

              {diagnosticLink?.url && (
                <article className="diagnostic-link-card">
                  <h3>Diagnostic URL</h3>
                  <p><strong>Expires:</strong> {formatTimestamp(diagnosticLink.expiresTs)}</p>
                  <input className="input" type="text" readOnly value={diagnosticLink.url} />
                  <div className="diagnostic-link-actions">
                    <button className="ghost-btn" onClick={() => void handleCopyDiagnosticLink()}>Copy</button>
                    {diagnosticLinkCopied && <span className="hint-text">{diagnosticLinkCopied}</span>}
                  </div>
                </article>
              )}
            </section>
          ) : (
            <section className="content-card">
              <form className="card unlock-card parent-pin-card" onSubmit={handleParentLoginSubmit}>
                <h2 className="title">Parent PIN</h2>
                <p className="subtitle">Enter parent PIN to open diagnostics, profile, and settings.</p>
                <input
                  type="password"
                  inputMode="numeric"
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={parentPin}
                  onChange={(event) => setParentPin(event.target.value)}
                  placeholder="PIN"
                  className="input"
                />
                {(parentPinError || settingsStatus) && <p className="error-text">{parentPinError || settingsStatus}</p>}
                <button type="submit" className="primary-btn" disabled={parentPinBusy}>
                  {parentPinBusy ? 'Checking...' : 'Unlock Parent Area'}
                </button>
              </form>
            </section>
          )
        ) : (
          <section className="content-card">
            {playScreen === 'home' && (
              <div className="home-layout">
                <h2>Today</h2>
                <p>
                  {childSettings.language_schedule === 'both'
                    ? 'Pick language and finish a daily challenge.'
                    : `Today is ${activeLanguage === 'uk' ? 'Ukrainian' : 'Russian'} day. Press start.`}
                </p>

                {childSettings.language_schedule === 'both' && (
                  <div className="language-toggle" role="tablist" aria-label="Language">
                    <button
                      className={`toggle-btn ${language === 'ru' ? 'active' : ''}`}
                      onClick={() => setLanguage('ru')}
                    >
                      Russian
                    </button>
                    <button
                      className={`toggle-btn ${language === 'uk' ? 'active' : ''}`}
                      onClick={() => setLanguage('uk')}
                    >
                      Ukrainian
                    </button>
                  </div>
                )}

                <ChallengeDots done={todayProgress.done} target={Math.max(todayProgress.target, dailyTarget)} />

                <button className="primary-btn start-btn" onClick={startDailyChallenge}>
                  Start Today
                </button>
              </div>
            )}

            {playScreen === 'reader' && currentText && (
              <div className="reader-layout">
                <div className="reader-header">
                  <h2>{currentText.title}</h2>
                  <p>Tap words for help. Tap sentence icon to hear full sentence.</p>
                </div>

                <div className="reader-content">
                  {(currentText.paragraphs || []).map((paragraph, paragraphIndex) => {
                    const sentenceText = paragraph;
                    return (
                      <div key={`p-${paragraphIndex}`} className="paragraph-block">
                        <button
                          className="sentence-play-btn"
                          onClick={() => handleSentencePlay(sentenceText, paragraphIndex)}
                          aria-label="Play sentence"
                        >
                          Play Sentence
                        </button>

                        <p className="paragraph-text">
                          {tokenizeParagraph(paragraph).map((token, tokenIndex) => {
                            if (/^[\p{L}\p{M}'’-]+$/u.test(token)) {
                              return (
                                <button
                                  key={`token-${paragraphIndex}-${tokenIndex}`}
                                  className="word-btn"
                                  onClick={() => handleWordTap(token)}
                                >
                                  {token}
                                </button>
                              );
                            }

                            return (
                              <span key={`token-${paragraphIndex}-${tokenIndex}`}>
                                {token}
                              </span>
                            );
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="reader-actions">
                  <button className="ghost-btn" onClick={() => void finishSession(false)}>Stop</button>
                  <button
                    className="primary-btn"
                    onClick={() => {
                      recordInteraction('READER_DONE', { text_id: currentText.id });
                      setPlayScreen('quiz');
                    }}
                  >
                    Done Reading
                  </button>
                </div>
              </div>
            )}

            {playScreen === 'quiz' && currentText && Array.isArray(currentText.quiz) && currentText.quiz[quizIndex] && (
              <div className="quiz-layout">
                <h2>Comprehension Check</h2>
                <p className="quiz-counter">Question {quizIndex + 1} / {currentText.quiz.length}</p>

                <article className="quiz-card">
                  <h3>{currentText.quiz[quizIndex].prompt}</h3>
                  <div className="choices-grid">
                    {currentText.quiz[quizIndex].choices.map((choice, choiceIndex) => {
                      const selected = quizAnswers[quizIndex]?.choiceIndex === choiceIndex;
                      const correct = quizAnswers[quizIndex]?.correct;

                      let extraClass = '';
                      if (selected && quizLocked) {
                        extraClass = correct ? 'correct' : 'incorrect';
                      }

                      return (
                        <button
                          key={`choice-${choice}`}
                          className={`choice-btn ${extraClass}`}
                          disabled={quizLocked}
                          onClick={() => void submitQuizAnswer(choiceIndex)}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                </article>
              </div>
            )}

            {playScreen === 'celebrate' && (
              <div className="celebrate-layout">
                <h2>Great work!</h2>
                <p>Challenge saved. Keep your streak tomorrow.</p>
                <button
                  className="primary-btn"
                  onClick={() => {
                    setPlayScreen('home');
                    setCurrentText(null);
                    setQuizAnswers([]);
                    setQuizIndex(0);
                  }}
                >
                  Back to Today
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default App;
