import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Show,
  SignIn,
  UserButton,
  useAuth,
  useUser,
} from '@clerk/react';
import { createApiClient } from './lib/api';
import './App.css';

function sortFilesByName(files) {
  return [...files].sort((left, right) => (
    String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  ));
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatBand(value) {
  const band = Number(value) || 1;
  return `Band ${band}`;
}

function formatDeckType(deck) {
  return deck?.type === 'book' ? 'Book deck' : 'Word deck';
}

function getDeckWordIds(deck) {
  return (Array.isArray(deck?.word_pool) ? deck.word_pool : [])
    .map((entry) => entry.word_id)
    .filter(Boolean);
}

function deckSecondaryText(deck) {
  if (!deck) {
    return '';
  }
  if (deck.type === 'book') {
    return deck.author || 'Imported book';
  }
  return deck.description || `${deck.word_count || 0} pasted words`;
}

function formatAssignmentProgress(progress) {
  if (!progress) {
    return 'No progress yet.';
  }

  const total = Number(progress.total_target_words) || 0;
  const mastered = Number(progress.mastered_count) || 0;
  const struggling = Number(progress.struggling_count) || 0;
  const learning = Math.max(0, (Number(progress.learning_count) || 0) - struggling);
  const notStarted = Number(progress.not_started_count ?? progress.new_count) || 0;
  const due = Number(progress.due_count) || 0;

  return `${total} words • ${mastered} mastered • ${notStarted} new • ${learning} learning • ${struggling} struggling • ${due} due now`;
}

function DeckWordInspector({ deck, expanded, onToggle }) {
  const words = Array.isArray(deck?.words) ? deck.words : [];

  return (
    <div className="deck-word-inspector">
      <button type="button" className="ghost-button deck-word-toggle" onClick={onToggle}>
        {expanded ? 'Hide Words' : `View All ${words.length} Words`}
      </button>

      {expanded ? (
        <div className="deck-word-panel">
          {words.length === 0 ? (
            <p className="empty-state">No words found in this deck yet.</p>
          ) : (
            <div className="deck-word-list">
              {words.map((word) => (
                <div key={word.id || word.lemma} className="deck-word-row">
                  <div>
                    <p className="deck-word-title">{word.lemma}</p>
                    <p className="deck-word-definition">{word.definition || 'No definition saved yet.'}</p>
                  </div>
                  {Array.isArray(word.distractors) && word.distractors.length > 0 ? (
                    <p className="deck-word-choices">
                      Wrong choices: {word.distractors.join(' | ')}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChildSummaryStats({ child }) {
  if (!child?.profile) {
    return null;
  }

  return (
    <>
      Known {child.profile.known_word_ids.length} • Learning {child.profile.learning_word_ids.length} • Struggling {child.profile.struggling_word_ids.length}
    </>
  );
}

function buildDeckGeneratorPrompt({
  topic,
  readingLevel,
  wordCount,
  existingWords = [],
}) {
  const normalizedTopic = String(topic || '').trim() || 'general everyday vocabulary';
  const normalizedReadingLevel = String(readingLevel || '').trim() || 'early elementary';
  const normalizedWordCount = Math.max(1, Number(wordCount) || 20);
  const normalizedExistingWords = [...new Set((Array.isArray(existingWords) ? existingWords : [])
    .map((word) => String(word || '').trim().toLowerCase())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const existingWordsSection = normalizedExistingWords.length > 0
    ? `\nExisting words already in the deck; do not repeat these or close variants:\n${normalizedExistingWords.join(', ')}\n`
    : '';
  const duplicateRule = normalizedExistingWords.length > 0
    ? '- Do not generate any existing words listed above\n'
    : '';

  return `Generate a vocabulary deck for children.

Topic: ${normalizedTopic}
Reading level: ${normalizedReadingLevel}
Number of words: ${normalizedWordCount}
${existingWordsSection}

Return only plain text rows with pipe-separated columns in this exact format:
word|definition|wrong choice 1|wrong choice 2|wrong choice 3

Rules:
- Produce exactly ${normalizedWordCount} rows
- One word per line
- Match the topic and reading level
${duplicateRule}- Use short, concrete, child-friendly definitions
- Wrong choices should be plausible meanings, not nonsense
- Avoid duplicate words
- Do not number the rows
- Do not use markdown
- Do not add any explanation before or after the rows

Example:
curious|wanting to know more|ready for bed|made of metal|easy to spill`;
}

function defaultAdaptiveSettings(profile) {
  return {
    target_band: String(profile?.target_band || 2),
    rolling_band_window: String(profile?.adaptive_settings?.rolling_band_window || 8),
    band_adjustment_min_answers: String(profile?.adaptive_settings?.band_adjustment_min_answers || 3),
    band_adjustment_step: String(profile?.adaptive_settings?.band_adjustment_step || 2),
  };
}

function formatImportProgress(job) {
  const parts = [];
  const pageTotal = Number(job?.page_total) || 0;
  const pageCompleted = Math.min(Number(job?.page_completed) || 0, pageTotal);
  const wordTotal = Number(job?.word_total) || 0;
  const wordCompleted = Math.min(Number(job?.word_completed) || 0, wordTotal);

  if (pageTotal > 0) {
    parts.push(`OCR ${pageCompleted}/${pageTotal}`);
  }
  if (wordTotal > 0) {
    parts.push(`Words ${wordCompleted}/${wordTotal}`);
  }

  return parts.join(' • ');
}

function mergeImportJobs(currentJobs, nextJob) {
  return [
    nextJob,
    ...currentJobs.filter((job) => job.id !== nextJob.id),
  ].sort((left, right) => (
    new Date(right?.updated_at || right?.created_at || 0).getTime()
    - new Date(left?.updated_at || left?.created_at || 0).getTime()
  ));
}

function ShellHeader({ role, name, onRefresh }) {
  return (
    <header className="shell-header">
      <div>
        <p className="eyebrow">vocab</p>
        <h1>{role === 'admin' ? 'Deck Prep Console' : 'Today’s Word Run'}</h1>
        <p className="subtitle">
          {role === 'admin'
            ? 'Inspect decks, generate word lists, and import book vocabulary from one focused console.'
            : `Signed in as ${name}. Keep the pace light and keep the cards moving.`}
        </p>
      </div>

      <div className="header-actions">
        <button type="button" className="ghost-button" onClick={onRefresh}>
          Refresh
        </button>
        <UserButton />
      </div>
    </header>
  );
}

function AdminPanel({ api, adminData, onReload, setNotice, setError }) {
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookText, setBookText] = useState('');
  const [language, setLanguage] = useState('en');
  const [bookGenerateImages, setBookGenerateImages] = useState(false);
  const [textFile, setTextFile] = useState(null);
  const [ocrFiles, setOcrFiles] = useState([]);
  const [deckTitle, setDeckTitle] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [deckWords, setDeckWords] = useState('');
  const [deckTargetId, setDeckTargetId] = useState('');
  const [deckGenerateImages, setDeckGenerateImages] = useState(false);
  const [deckPromptTopic, setDeckPromptTopic] = useState('');
  const [deckPromptReadingLevel, setDeckPromptReadingLevel] = useState('early elementary');
  const [deckPromptWordCount, setDeckPromptWordCount] = useState('20');
  const [deckPromptIncludeExistingWords, setDeckPromptIncludeExistingWords] = useState(true);
  const [deckPromptCopied, setDeckPromptCopied] = useState(false);
  const [expandedDeckId, setExpandedDeckId] = useState('');
  const [selectedAdminChildId, setSelectedAdminChildId] = useState('');
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedProfileChildId, setSelectedProfileChildId] = useState('');
  const [enableHints, setEnableHints] = useState(true);
  const [enableImages, setEnableImages] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState('');
  const [savingProfileChildId, setSavingProfileChildId] = useState('');
  const [adaptiveDraft, setAdaptiveDraft] = useState(defaultAdaptiveSettings());
  const [importJobs, setImportJobs] = useState(adminData.importJobs || []);
  const [trackedImportJobId, setTrackedImportJobId] = useState('');

  const upsertImportJob = useCallback((job) => {
    setImportJobs((currentJobs) => mergeImportJobs(currentJobs, job));
  }, []);

  useEffect(() => {
    const firstPublishedDeck = adminData.decks.find((deck) => deck.status === 'published');
    const hasSelectedDeck = adminData.decks.some((deck) => deck.id === selectedDeckId && deck.status === 'published');
    if (!hasSelectedDeck) {
      setSelectedDeckId(firstPublishedDeck?.id || '');
    }
    if (!selectedChildId && adminData.children[0]) {
      setSelectedChildId(adminData.children[0].user_id);
    }
    if (!selectedProfileChildId && adminData.children[0]) {
      setSelectedProfileChildId(adminData.children[0].user_id);
    }
  }, [adminData.decks, adminData.children, selectedDeckId, selectedChildId, selectedProfileChildId]);

  useEffect(() => {
    if (!selectedAdminChildId) {
      return;
    }

    const selectedChildExists = adminData.children.some((child) => child.user_id === selectedAdminChildId);
    if (!selectedChildExists) {
      setSelectedAdminChildId('');
    }
  }, [adminData.children, selectedAdminChildId]);

  useEffect(() => {
    const selectedProfileChild = adminData.children.find((child) => child.user_id === selectedProfileChildId)
      || adminData.children[0]
      || null;

    if (!selectedProfileChild) {
      setAdaptiveDraft(defaultAdaptiveSettings());
      return;
    }

    setAdaptiveDraft(defaultAdaptiveSettings(selectedProfileChild.profile));
  }, [adminData.children, selectedProfileChildId]);

  useEffect(() => {
    setImportJobs(adminData.importJobs || []);
  }, [adminData.importJobs]);

  useEffect(() => {
    if (trackedImportJobId) {
      return;
    }

    const activeJob = (adminData.importJobs || []).find((job) => (
      job.status === 'queued' || job.status === 'processing'
    ));

    if (activeJob) {
      setTrackedImportJobId(activeJob.id);
    }
  }, [adminData.importJobs, trackedImportJobId]);

  useEffect(() => {
    if (!trackedImportJobId) {
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      try {
        const data = await api.getImportJob(trackedImportJobId);
        const nextJob = data.job;
        upsertImportJob(nextJob);

        if (nextJob.status === 'completed') {
          setTrackedImportJobId('');
          const completedLabel = nextJob.job_type === 'deck_append'
            ? 'Deck updated'
            : nextJob.job_type === 'deck'
              ? 'Deck ready'
              : 'Book import completed';
          setNotice(`${completedLabel}: ${nextJob.title}.`);
          onReload();
          return;
        }

        if (nextJob.status === 'failed') {
          setTrackedImportJobId('');
          const failedLabel = nextJob.job_type === 'deck_append'
            ? 'Deck update failed.'
            : nextJob.job_type === 'deck'
              ? 'Deck build failed.'
              : 'Book import failed.';
          setError(nextJob.message || failedLabel);
        }
      } catch (error) {
        setTrackedImportJobId('');
        setError(error.message || 'Could not check import status.');
      }
    }, 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [api, onReload, setError, setNotice, trackedImportJobId, upsertImportJob]);

  async function handleImport(event) {
    event.preventDefault();
    setImportBusy(true);
    setError('');
    setNotice('');

    try {
      const data = await api.importBook({
        title: bookTitle,
        author: bookAuthor,
        language,
        text: bookText.trim(),
        text_file: !bookText.trim() ? textFile : null,
        ocr_files: sortFilesByName(ocrFiles),
        generate_images: bookGenerateImages,
      });

      setBookTitle('');
      setBookAuthor('');
      setBookText('');
      setTextFile(null);
      setOcrFiles([]);
      setBookGenerateImages(false);
      if (data?.job) {
        upsertImportJob(data.job);
        setTrackedImportJobId(data.job.id);
      }
      setNotice('Book import started. This page will update when the draft is ready.');
    } catch (error) {
      setError(error.message || 'Book import failed.');
    } finally {
      setImportBusy(false);
    }
  }

  async function handleCreateDeck(event) {
    event.preventDefault();
    setDeckBusy(true);
    setError('');
    setNotice('');

    try {
      const data = deckTargetId
        ? await api.appendDeckWords(deckTargetId, {
            words_text: deckWords,
            generate_images: deckGenerateImages,
          })
        : await api.createDeck({
            title: deckTitle,
            description: deckDescription,
            language: 'en',
            words_text: deckWords,
            generate_images: deckGenerateImages,
          });

      if (!deckTargetId) {
        setDeckTitle('');
        setDeckDescription('');
      }
      setDeckWords('');
      setDeckGenerateImages(false);
      if (data?.job) {
        upsertImportJob(data.job);
        setTrackedImportJobId(data.job.id);
      }
      setNotice(deckTargetId
        ? 'Deck word update started. This page will update when it is ready.'
        : 'Deck build started. This page will update when it is ready.');
    } catch (error) {
      setError(error.message || (deckTargetId ? 'Deck word update failed.' : 'Deck build failed.'));
    } finally {
      setDeckBusy(false);
    }
  }

  async function handleCopyDeckPrompt() {
    try {
      await navigator.clipboard.writeText(deckGeneratorPrompt);
      setDeckPromptCopied(true);
      window.setTimeout(() => {
        setDeckPromptCopied(false);
      }, 1500);
    } catch (error) {
      setError(error.message || 'Could not copy the AI prompt.');
    }
  }

  async function handlePublish(bookId) {
    setError('');
    setNotice('');
    try {
      await api.publishBook(bookId);
      setNotice('Book published.');
      await onReload();
    } catch (error) {
      setError(error.message || 'Publish failed.');
    }
  }

  async function handleAssign(event) {
    event.preventDefault();
    const assignmentChildId = selectedAdminChildId || selectedChildId;
    if (!selectedDeckId || !assignmentChildId) {
      setError('Choose both a deck and a child profile before assigning.');
      return;
    }

    setAssignBusy(true);
    setError('');
    setNotice('');
    try {
      await api.createAssignment({
        deck_id: selectedDeckId,
        child_user_id: assignmentChildId,
        settings: {
          hints_enabled: enableHints,
          images_enabled: enableImages,
        },
      });
      setNotice('Assignment created.');
      await onReload();
    } catch (error) {
      setError(error.message || 'Assignment failed.');
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleToggleAssignmentHints(assignment) {
    setUpdatingAssignmentId(assignment.id);
    setError('');
    setNotice('');

    try {
      await api.updateAssignment(assignment.id, {
        settings: {
          ...(assignment.settings || {}),
          hints_enabled: !assignment.settings?.hints_enabled,
        },
      });
      setNotice(`Hints ${assignment.settings?.hints_enabled ? 'disabled' : 'enabled'} for ${assignment.deck?.title || 'the assignment'}.`);
      await onReload();
    } catch (error) {
      setError(error.message || 'Could not update assignment settings.');
    } finally {
      setUpdatingAssignmentId('');
    }
  }

  async function handleSaveAdaptiveSettings(event) {
    event.preventDefault();
    if (!selectedProfileChildId) {
      setError('Choose a child profile first.');
      return;
    }

    setSavingProfileChildId(selectedProfileChildId);
    setError('');
    setNotice('');

    try {
      const result = await api.updateChildProfile(selectedProfileChildId, {
        target_band: Number(adaptiveDraft.target_band),
        adaptive_settings: {
          rolling_band_window: Number(adaptiveDraft.rolling_band_window),
          band_adjustment_min_answers: Number(adaptiveDraft.band_adjustment_min_answers),
          band_adjustment_step: Number(adaptiveDraft.band_adjustment_step),
        },
      });
      setAdaptiveDraft(defaultAdaptiveSettings(result.profile));
      setNotice('Child profile tuning saved.');
      await onReload();
    } catch (error) {
      setError(error.message || 'Could not update child profile settings.');
    } finally {
      setSavingProfileChildId('');
    }
  }

  function handleOpenChildDetail(child) {
    setSelectedAdminChildId(child.user_id);
    setSelectedChildId(child.user_id);
    setSelectedProfileChildId(child.user_id);
    setAdaptiveDraft(defaultAdaptiveSettings(child.profile));
  }

  function handleBackToAdminDashboard() {
    setSelectedAdminChildId('');
  }

  const publishedDecks = adminData.decks.filter((deck) => deck.status === 'published');
  const allDecks = adminData.decks;
  const customDecks = adminData.decks.filter((deck) => deck.type !== 'book');
  const selectedAppendDeck = customDecks.find((deck) => deck.id === deckTargetId) || null;
  const selectedAppendDeckWordIds = selectedAppendDeck ? getDeckWordIds(selectedAppendDeck) : [];
  const existingPromptWords = useMemo(() => (
    deckPromptIncludeExistingWords && selectedAppendDeck
      ? (selectedAppendDeck.words || []).map((word) => word.lemma)
      : []
  ), [deckPromptIncludeExistingWords, selectedAppendDeck]);
  const recentImportJobs = importJobs.slice(0, 8);
  const activeImportJobs = recentImportJobs.filter((job) => job.status === 'queued' || job.status === 'processing');
  const selectedProfileChild = adminData.children.find((child) => child.user_id === selectedProfileChildId) || null;
  const selectedAdminChild = adminData.children.find((child) => child.user_id === selectedAdminChildId) || null;
  const deckGeneratorPrompt = useMemo(() => buildDeckGeneratorPrompt({
    topic: deckPromptTopic,
    readingLevel: deckPromptReadingLevel,
    wordCount: deckPromptWordCount,
    existingWords: existingPromptWords,
  }), [deckPromptReadingLevel, deckPromptTopic, deckPromptWordCount, existingPromptWords]);

  function renderDeckCard(deck) {
    const words = Array.isArray(deck.words) ? deck.words : [];
    const wordIds = getDeckWordIds(deck);

    return (
      <article key={deck.id} className="list-card">
        <div className="list-card-head">
          <div>
            <h3>{deck.title}</h3>
            <p>{deckSecondaryText(deck)}</p>
          </div>
          <span className={`status-pill status-${deck.status}`}>{deck.status}</span>
        </div>
        <p>
          {wordIds.length} words • {formatDeckType(deck)}
          {deck.type === 'book' && deck.word_count ? ` • ${deck.word_count} words in source` : ''}
        </p>
        <div className="token-row">
          {words.slice(0, 8).map((word) => (
            <span key={word.id || word.lemma} className="token">
              {word.lemma}
            </span>
          ))}
        </div>
        <div className="card-actions">
          <DeckWordInspector
            deck={deck}
            expanded={expandedDeckId === deck.id}
            onToggle={() => setExpandedDeckId((currentId) => (currentId === deck.id ? '' : deck.id))}
          />
          {deck.type === 'book' && deck.status !== 'published' ? (
            <button type="button" className="ghost-button" onClick={() => handlePublish(deck.book_id || deck.id)}>
              Publish Book Deck
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  if (selectedAdminChild) {
    return (
      <div className="workspace-grid admin-workspace child-admin-workspace">
        <section className="panel admin-wide-panel child-admin-hero">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Child Admin</p>
              <h2>{selectedAdminChild.display_name}</h2>
              <p>{selectedAdminChild.email}</p>
            </div>
            <button type="button" className="ghost-button" onClick={handleBackToAdminDashboard}>
              Back To Admin
            </button>
          </div>
          <div className="metric-row">
            <div className="metric-card">
              <h3>Known</h3>
              <p>{selectedAdminChild.profile.known_word_ids.length}</p>
            </div>
            <div className="metric-card">
              <h3>Learning</h3>
              <p>{selectedAdminChild.profile.learning_word_ids.length}</p>
            </div>
            <div className="metric-card">
              <h3>Struggling</h3>
              <p>{selectedAdminChild.profile.struggling_word_ids.length}</p>
            </div>
          </div>
        </section>

        <section className="panel child-admin-decks admin-wide-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Deck Status</p>
              <h2>Assigned Decks</h2>
            </div>
            <span className="panel-chip">{(selectedAdminChild.assignments || []).length} active</span>
          </div>
          {(selectedAdminChild.assignments || []).length > 0 ? (
            <div className="assignment-admin-list">
              {(selectedAdminChild.assignments || []).map((assignment) => (
                <div key={assignment.id} className="assignment-admin-row child-admin-assignment-row">
                  <div>
                    <p className="assignment-admin-title">{assignment.deck?.title || 'Assigned deck'}</p>
                    <p className="assignment-admin-meta">
                      {formatDeckType(assignment.deck)} • Hints {assignment.settings?.hints_enabled ? 'on' : 'off'} • Images {assignment.settings?.images_enabled ? 'on' : 'off'}
                    </p>
                    <p className="assignment-admin-meta">{formatAssignmentProgress(assignment.progress)}</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button assignment-admin-button"
                    onClick={() => handleToggleAssignmentHints(assignment)}
                    disabled={updatingAssignmentId === assignment.id}
                  >
                    {updatingAssignmentId === assignment.id
                      ? 'Saving…'
                      : assignment.settings?.hints_enabled
                        ? 'Disable Hints'
                        : 'Enable Hints'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No active decks assigned yet.</p>
          )}
        </section>

        <section className="panel assign-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Assign</p>
              <h2>Add A Deck</h2>
            </div>
            <span className="panel-chip">{publishedDecks.length} published decks</span>
          </div>

          <form className="stack" onSubmit={handleAssign}>
            <div className="profile-tuning-summary">
              <p>Assigning to {selectedAdminChild.display_name}</p>
              <p>{selectedAdminChild.email}</p>
            </div>

            <label className="field">
              <span>Deck</span>
              <select value={selectedDeckId} onChange={(event) => setSelectedDeckId(event.target.value)}>
                <option value="">Choose a published deck</option>
                {publishedDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.title} ({formatDeckType(deck)})
                  </option>
                ))}
              </select>
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={enableHints}
                onChange={(event) => setEnableHints(event.target.checked)}
              />
              <span>Allow hints in the child session</span>
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={enableImages}
                onChange={(event) => setEnableImages(event.target.checked)}
              />
              <span>Show illustrations when a word has one</span>
            </label>

            <button type="submit" className="primary-button" disabled={assignBusy}>
              {assignBusy ? 'Assigning…' : `Assign To ${selectedAdminChild.display_name}`}
            </button>
          </form>
        </section>

        <section className="panel profile-tuning-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Adaptive</p>
              <h2>Tuning</h2>
            </div>
            <span className="panel-chip">{formatBand(adaptiveDraft.target_band)}</span>
          </div>

          <form className="stack" onSubmit={handleSaveAdaptiveSettings}>
            <label className="field">
              <span>Target Band</span>
              <select
                value={adaptiveDraft.target_band}
                onChange={(event) => setAdaptiveDraft((current) => ({
                  ...current,
                  target_band: event.target.value,
                }))}
              >
                <option value="1">Band 1 — Easiest</option>
                <option value="2">Band 2</option>
                <option value="3">Band 3</option>
                <option value="4">Band 4</option>
                <option value="5">Band 5</option>
                <option value="6">Band 6 — Hardest</option>
              </select>
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Rolling Window</span>
                <input
                  type="number"
                  min="3"
                  max="20"
                  value={adaptiveDraft.rolling_band_window}
                  onChange={(event) => setAdaptiveDraft((current) => ({
                    ...current,
                    rolling_band_window: event.target.value,
                  }))}
                />
              </label>

              <label className="field">
                <span>Judge After</span>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={adaptiveDraft.band_adjustment_min_answers}
                  onChange={(event) => setAdaptiveDraft((current) => ({
                    ...current,
                    band_adjustment_min_answers: event.target.value,
                  }))}
                />
              </label>

              <label className="field">
                <span>Recheck Every</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={adaptiveDraft.band_adjustment_step}
                  onChange={(event) => setAdaptiveDraft((current) => ({
                    ...current,
                    band_adjustment_step: event.target.value,
                  }))}
                />
              </label>
            </div>

            <p className="form-note">
              This tunes how quickly this child can move between bands as answers come in.
            </p>

            <button
              type="submit"
              className="primary-button"
              disabled={savingProfileChildId === selectedAdminChild.user_id}
            >
              {savingProfileChildId === selectedAdminChild.user_id ? 'Saving…' : 'Save Child Tuning'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-grid admin-workspace">
      {activeImportJobs.length > 0 ? (
        <section className="panel admin-wide-panel active-jobs-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Working</p>
              <h2>Active Jobs</h2>
            </div>
            <span className="panel-chip">{activeImportJobs.length} running</span>
          </div>
          <div className="job-status-strip">
            {activeImportJobs.map((job) => (
              <div key={job.id} className="job-status-card">
                <div>
                  <p className="assignment-admin-title">{job.title}</p>
                  <p className="assignment-admin-meta">{job.message || 'Waiting for status update.'}</p>
                </div>
                <span className={`status-pill status-${job.status}`}>{formatImportProgress(job) || job.status}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel list-panel admin-wide-panel deck-library-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Deck Library</h2>
            <p>Inspect every word deck in one place, including imported book decks.</p>
          </div>
          <span className="panel-chip">{allDecks.length} decks</span>
        </div>

        <div className="card-list deck-library-list">
          {allDecks.length === 0 ? (
            <p className="empty-state">No decks yet. Add a book or build a word deck to get started.</p>
          ) : (
            allDecks.map((deck) => renderDeckCard(deck))
          )}
        </div>
      </section>

      <section className="panel list-panel admin-wide-panel child-list-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Children</p>
            <h2>Child Admin</h2>
            <p>Open a child to inspect decks, progress, and controls.</p>
          </div>
          <span className="panel-chip">{adminData.children.length} children</span>
        </div>

        <div className="child-admin-list">
          {adminData.children.length === 0 ? (
            <p className="empty-state">No child users found in Clerk yet.</p>
          ) : (
            adminData.children.map((child) => (
              <button
                key={child.user_id}
                type="button"
                className="child-admin-row"
                onClick={() => handleOpenChildDetail(child)}
                aria-label={`Open admin page for ${child.display_name}`}
              >
                <span>
                  <span className="child-admin-name">{child.display_name}</span>
                  <span className="child-admin-meta">{child.email}</span>
                </span>
                <span className="child-admin-pill">{formatBand(child.profile.target_band)}</span>
                <span className="child-admin-meta">Active decks: {(child.assignments || []).length}</span>
                <span className="child-admin-meta">
                  <ChildSummaryStats child={child} />
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel import-panel book-import-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Import</p>
            <h2>Add a Book</h2>
          </div>
          <span className="panel-chip">Admin only</span>
        </div>

        <form className="stack" onSubmit={handleImport}>
          <label className="field">
            <span>Title</span>
            <input value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} required />
          </label>

          <label className="field">
            <span>Author</span>
            <input value={bookAuthor} onChange={(event) => setBookAuthor(event.target.value)} />
          </label>

          <label className="field">
            <span>Language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">English</option>
            </select>
          </label>

          <label className="field">
            <span>Paste Text</span>
            <textarea
              rows={8}
              value={bookText}
              onChange={(event) => setBookText(event.target.value)}
              placeholder="Paste plain text here, or leave this blank and upload a .txt file or page photos."
            />
          </label>

          <label className="field">
            <span>Text Or PDF File</span>
            <input
              type="file"
              accept=".txt,text/plain,.pdf,application/pdf"
              onChange={(event) => setTextFile(event.target.files?.[0] || null)}
            />
          </label>

          <label className="field">
            <span>Page Photos For OCR</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setOcrFiles([...(event.target.files || [])])}
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={bookGenerateImages}
              onChange={(event) => setBookGenerateImages(event.target.checked)}
            />
            <span>Generate illustrations for imported words when available</span>
          </label>

          <button type="submit" className="primary-button" disabled={importBusy}>
            {importBusy ? 'Starting…' : 'Start Import'}
          </button>
        </form>
      </section>

      <section className="panel import-panel deck-builder-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Word Deck</p>
            <h2>Generate Word Deck</h2>
          </div>
          <span className="panel-chip">AI prompt</span>
        </div>

        <form className="stack" onSubmit={handleCreateDeck}>
          <label className="field">
            <span>Deck Action</span>
            <select value={deckTargetId} onChange={(event) => setDeckTargetId(event.target.value)}>
              <option value="">Create a new word deck</option>
              {customDecks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  Add to {deck.title} ({getDeckWordIds(deck).length} words)
                </option>
              ))}
            </select>
          </label>

          {selectedAppendDeck ? (
            <div className="profile-tuning-summary">
              <p>Adding words to {selectedAppendDeck.title}.</p>
              <p>{selectedAppendDeckWordIds.length} existing words. New assignments will use the updated deck automatically.</p>
            </div>
          ) : (
            <>
              <label className="field">
                <span>Deck Title</span>
                <input value={deckTitle} onChange={(event) => setDeckTitle(event.target.value)} required />
              </label>

              <label className="field">
                <span>Description</span>
                <input
                  value={deckDescription}
                  onChange={(event) => setDeckDescription(event.target.value)}
                  placeholder="Level 1 foundations, animal words, science review..."
                />
              </label>
            </>
          )}

          <div className="prompt-helper">
            <div className="prompt-helper-head">
              <p className="prompt-helper-title">Prompt Another AI</p>
              <button type="button" className="ghost-button" onClick={handleCopyDeckPrompt}>
                {deckPromptCopied ? 'Copied' : 'Copy Prompt'}
              </button>
            </div>
            <div className="prompt-helper-controls">
              <label className="field">
                <span>Topic</span>
                <input
                  value={deckPromptTopic}
                  onChange={(event) => setDeckPromptTopic(event.target.value)}
                  placeholder="ocean animals, grade 2 science, feelings..."
                />
              </label>

              <label className="field">
                <span>Reading Level</span>
                <input
                  value={deckPromptReadingLevel}
                  onChange={(event) => setDeckPromptReadingLevel(event.target.value)}
                  placeholder="early elementary, grade 3, strong readers..."
                />
              </label>

              <label className="field">
                <span>Word Count</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={deckPromptWordCount}
                  onChange={(event) => setDeckPromptWordCount(event.target.value)}
                />
              </label>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={deckPromptIncludeExistingWords}
                disabled={!selectedAppendDeck}
                onChange={(event) => setDeckPromptIncludeExistingWords(event.target.checked)}
              />
              <span>
                {selectedAppendDeck
                  ? `Include ${selectedAppendDeckWordIds.length} current deck words in the prompt so the AI avoids repeats`
                  : 'Choose an existing deck above to include its current words in the prompt'}
              </span>
            </label>
            <details className="prompt-preview">
              <summary>Preview Prompt</summary>
              <textarea
                className="prompt-helper-text"
                rows={10}
                value={deckGeneratorPrompt}
                readOnly
              />
            </details>
          </div>

          <label className="field">
            <span>Words</span>
            <textarea
              rows={8}
              value={deckWords}
              onChange={(event) => setDeckWords(event.target.value)}
              placeholder={'big|very large|tiny|very loud|full of water\ncurious|wanting to know more|ready for bed|made of metal|easy to spill'}
              required
            />
          </label>

          <p className="form-note">
            Paste either a simple word list, or one word per line with pipe-separated columns:
            word, definition, wrong choice 1, wrong choice 2, wrong choice 3.
            Optional extra columns: hint, example 1, example 2. Tab separators also work.
          </p>

          <label className="toggle">
            <input
              type="checkbox"
              checked={deckGenerateImages}
              onChange={(event) => setDeckGenerateImages(event.target.checked)}
            />
            <span>Generate illustrations for deck words when available</span>
          </label>

          <button type="submit" className="primary-button" disabled={deckBusy}>
            {deckBusy
              ? 'Starting…'
              : selectedAppendDeck
                ? 'Add Words To Deck'
                : 'Build Deck'}
          </button>
        </form>
      </section>

      <details className="panel advanced-admin-panel admin-wide-panel">
        <summary>
          <span>Advanced Admin</span>
          <small>Assignments, tuning, and job history</small>
        </summary>

        <div className="advanced-admin-grid">
      <section className="panel assign-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Assign</p>
            <h2>Create A Practice Deck</h2>
          </div>
          <span className="panel-chip">{publishedDecks.length} published decks</span>
        </div>

        <form className="stack" onSubmit={handleAssign}>
          <label className="field">
            <span>Child</span>
            <select value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>
              <option value="">Choose a child</option>
              {adminData.children.map((child) => (
                <option key={child.user_id} value={child.user_id}>
                  {child.display_name} ({formatBand(child.profile.target_band)})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Deck</span>
            <select value={selectedDeckId} onChange={(event) => setSelectedDeckId(event.target.value)}>
              <option value="">Choose a published deck</option>
              {publishedDecks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.title} ({formatDeckType(deck)})
                </option>
              ))}
            </select>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={enableHints}
              onChange={(event) => setEnableHints(event.target.checked)}
            />
            <span>Allow hints in the child session</span>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={enableImages}
              onChange={(event) => setEnableImages(event.target.checked)}
            />
            <span>Show illustrations when a word has one</span>
          </label>

          <button type="submit" className="primary-button" disabled={assignBusy}>
            {assignBusy ? 'Assigning…' : 'Assign Deck'}
          </button>
        </form>
      </section>

      <section className="panel profile-tuning-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Child Profile</p>
            <h2>Adaptive Tuning</h2>
          </div>
          <span className="panel-chip">{selectedProfileChild ? formatBand(adaptiveDraft.target_band) : 'No child'}</span>
        </div>

        <form className="stack" onSubmit={handleSaveAdaptiveSettings}>
          <label className="field">
            <span>Child Profile</span>
            <select value={selectedProfileChildId} onChange={(event) => setSelectedProfileChildId(event.target.value)}>
              <option value="">Choose a child</option>
              {adminData.children.map((child) => (
                <option key={child.user_id} value={child.user_id}>
                  {child.display_name}
                </option>
              ))}
            </select>
          </label>

          {selectedProfileChild ? (
            <div className="profile-tuning-summary">
              <p>{selectedProfileChild.email}</p>
              <p>
                Known {selectedProfileChild.profile.known_word_ids.length} • Learning {selectedProfileChild.profile.learning_word_ids.length} • Struggling {selectedProfileChild.profile.struggling_word_ids.length}
              </p>
            </div>
          ) : null}

          {selectedProfileChild ? (
            (selectedProfileChild.assignments || []).length > 0 ? (
              <div className="assignment-admin-list">
                {(selectedProfileChild.assignments || []).map((assignment) => (
                  <div key={assignment.id} className="assignment-admin-row">
                    <div>
                      <p className="assignment-admin-title">{assignment.deck?.title || 'Assigned deck'}</p>
                      <p className="assignment-admin-meta">{formatAssignmentProgress(assignment.progress)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="form-note">No active decks assigned to this child.</p>
            )
          ) : null}

          <label className="field">
            <span>Target Band</span>
            <select
              value={adaptiveDraft.target_band}
              onChange={(event) => setAdaptiveDraft((current) => ({
                ...current,
                target_band: event.target.value,
              }))}
            >
              <option value="1">Band 1 — Easiest</option>
              <option value="2">Band 2</option>
              <option value="3">Band 3</option>
              <option value="4">Band 4</option>
              <option value="5">Band 5</option>
              <option value="6">Band 6 — Hardest</option>
            </select>
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Rolling Window</span>
              <input
                type="number"
                min="3"
                max="20"
                value={adaptiveDraft.rolling_band_window}
                onChange={(event) => setAdaptiveDraft((current) => ({
                  ...current,
                  rolling_band_window: event.target.value,
                }))}
              />
            </label>

            <label className="field">
              <span>Judge After</span>
              <input
                type="number"
                min="2"
                max="20"
                value={adaptiveDraft.band_adjustment_min_answers}
                onChange={(event) => setAdaptiveDraft((current) => ({
                  ...current,
                  band_adjustment_min_answers: event.target.value,
                }))}
              />
            </label>

            <label className="field">
              <span>Recheck Every</span>
              <input
                type="number"
                min="1"
                max="10"
                value={adaptiveDraft.band_adjustment_step}
                onChange={(event) => setAdaptiveDraft((current) => ({
                  ...current,
                  band_adjustment_step: event.target.value,
                }))}
              />
            </label>
          </div>

          <p className="form-note">
            This tunes how quickly this child can move between bands as answers come in.
          </p>

          <button
            type="submit"
            className="primary-button"
            disabled={!selectedProfileChildId || savingProfileChildId === selectedProfileChildId}
          >
            {savingProfileChildId === selectedProfileChildId ? 'Saving…' : 'Save Child Profile'}
          </button>
        </form>
      </section>

      <section className="panel list-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Import Jobs</p>
            <h2>Recent Runs</h2>
          </div>
        </div>

        <div className="card-list">
          {recentImportJobs.length === 0 ? (
            <p className="empty-state">No import jobs yet.</p>
          ) : (
            recentImportJobs.map((job) => (
              <article key={job.id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h3>{job.title}</h3>
                    <p>{job.message || 'Waiting for status update.'}</p>
                  </div>
                  <span className={`status-pill status-${job.status}`}>{job.status}</span>
                </div>
                <p>
                  {formatImportProgress(job) || 'Queued for processing'}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

        </div>
      </details>
    </div>
  );
}

function ChildPanel({ childData, sessionState, onStart, onSelectChoice, onShowHint, onDismissFeedback, onBackToAssignments }) {
  const currentWordId = sessionState?.queue?.[sessionState.currentCardIndex] || null;
  const currentCard = currentWordId
    ? sessionState?.cards?.find((card) => card.word_id === currentWordId) || null
    : null;
  const currentAnswer = currentCard && sessionState?.activeAnswer?.wordId === currentCard.word_id
    ? sessionState.activeAnswer
    : null;
  const currentDefinition = currentCard?.definition || sessionState?.feedback?.correctChoice || '';
  const currentUsageExamples = Array.isArray(currentCard?.usage_examples)
    ? currentCard.usage_examples.filter(Boolean).slice(0, 2)
    : [];

  if (sessionState?.summary) {
    return (
      <section className="panel child-session-panel session-complete">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Session Complete</p>
            <h2>Nice, concise work.</h2>
          </div>
          <span className="panel-chip">{formatPercent(sessionState.summary.accuracy)}</span>
        </div>

        <p className="summary-text">
          Target band is now {formatBand(sessionState.profile.target_band)}. Known words: {sessionState.profile.known_word_ids.length}.
        </p>

        <button type="button" className="primary-button" onClick={sessionState.onClose}>
          Back To Assignments
        </button>
      </section>
    );
  }

  if (currentCard) {
    return (
      <section className="panel child-session-panel child-session-live">
        <div className="session-toolbar">
          <button type="button" className="ghost-button session-back-button" onClick={onBackToAssignments}>
            Back
          </button>
        </div>

        <article key={currentCard.word_id} className="word-card">
          <h2>{currentCard.lemma}</h2>

          {currentCard.hint ? (
            <div className="hint-strip">
              {sessionState.hintVisible ? (
                <p className="hint-copy">{currentCard.hint}</p>
              ) : (
                <button type="button" className="ghost-button hint-action" onClick={onShowHint}>
                  Show Hint
                </button>
              )}
            </div>
          ) : null}

          {currentCard.image_url ? (
            <img className="word-image" src={currentCard.image_url} alt={currentCard.lemma} />
          ) : null}

          <div className="choice-grid choice-grid-session">
            {currentCard.choices.map((choice, index) => {
              const isSelected = currentAnswer?.selectedIndex === index;
              return (
                <button
                  key={`${currentCard.card_id}-${choice}`}
                  type="button"
                  className={`choice-button ${isSelected ? `choice-${currentAnswer.correct ? 'correct' : 'wrong'}` : ''} ${
                    currentAnswer && index === currentCard.correct_index && !currentAnswer.correct ? 'choice-correct-reveal' : ''
                  }`}
                  onClick={() => onSelectChoice(index)}
                  disabled={Boolean(currentAnswer)}
                >
                  {choice}
                </button>
              );
            })}
          </div>

          {sessionState.feedback ? (
            sessionState.feedback.kind === 'right' ? (
              <div className="session-feedback session-feedback-right">
                <p className="session-feedback-title">You're right</p>
              </div>
            ) : (
              <div
                className="session-feedback-screen"
                role="dialog"
                aria-modal="true"
                aria-labelledby="wrong-word-title"
                tabIndex={0}
                onClick={onDismissFeedback}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
                    event.preventDefault();
                    onDismissFeedback();
                  }
                }}
              >
                <div className="session-feedback-panel">
                  <h3 id="wrong-word-title" className="session-feedback-word">{currentCard?.lemma}</h3>
                  <p className="session-feedback-definition">{currentDefinition}</p>
                  {currentUsageExamples.length > 0 ? (
                    <div className="session-feedback-example-list">
                        {currentUsageExamples.map((example) => (
                          <p key={example} className="session-feedback-example">
                            {example}
                          </p>
                        ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          ) : null}
        </article>
      </section>
    );
  }

  if (sessionState) {
    return (
      <section className="panel loading-panel">
        <p>Wrapping up this session…</p>
      </section>
    );
  }

  return (
    <div className="workspace-grid child-grid">
      <section className="panel child-overview-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>{childData.profile.display_name || 'Reader'}</h2>
          </div>
          <span className="panel-chip">{formatBand(childData.profile.target_band)}</span>
        </div>

        <div className="metric-row">
          <article className="metric-card">
            <h3>Known</h3>
            <p>{childData.profile.known_word_ids.length}</p>
          </article>
          <article className="metric-card">
            <h3>Learning</h3>
            <p>{childData.profile.learning_word_ids.length}</p>
          </article>
          <article className="metric-card">
            <h3>Struggling</h3>
            <p>{childData.profile.struggling_word_ids.length}</p>
          </article>
        </div>
      </section>

      <section className="panel child-assignments-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Assignments</p>
            <h2>Ready Decks</h2>
          </div>
        </div>

        <div className="card-list">
          {childData.assignments.length === 0 ? (
            <p className="empty-state">No active practice deck yet.</p>
          ) : (
            childData.assignments.map((assignment) => (
              <article key={assignment.id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h3>{assignment.deck.title}</h3>
                    <p>{deckSecondaryText(assignment.deck)}</p>
                  </div>
                  <span className="status-pill status-live">
                    {assignment.progress.mastered_count}/{assignment.progress.total_target_words}
                  </span>
                </div>
                <p>
                  Due now {assignment.progress.due_count} • Learning {assignment.progress.learning_count}
                </p>
                <p>
                  {formatDeckType(assignment.deck)} • Hints {assignment.settings.hints_enabled ? 'on' : 'off'} • Images {assignment.settings.images_enabled ? 'on' : 'off'}
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => onStart(assignment.id)}
                >
                  Start Session
                </button>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const { isLoaded, userId, getToken } = useAuth();
  const { user } = useUser();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [me, setMe] = useState(null);
  const [adminData, setAdminData] = useState({ books: [], decks: [], children: [], importJobs: [] });
  const [childData, setChildData] = useState({ assignments: [], profile: null });
  const [sessionState, setSessionState] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const startTimeRef = useRef(0);
  const advanceTimerRef = useRef(0);

  const fetchMe = useCallback(() => api.getMe(), [api]);

  const fetchAdminData = useCallback(async () => {
    const [decksData, childrenData] = await Promise.all([
      api.getAdminDecks(),
      api.getChildren(),
    ]);
    return {
      books: decksData.books || [],
      decks: decksData.decks || [],
      children: childrenData.children || [],
      importJobs: decksData.import_jobs || [],
    };
  }, [api]);

  const fetchChildData = useCallback(async () => {
    const data = await api.getAssignments();
    return {
      assignments: data.assignments || [],
      profile: data.profile || null,
    };
  }, [api]);

  const refreshAll = useCallback(() => {
    setError('');
    setReloadNonce((value) => value + 1);
  }, []);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !userId) {
      return;
    }

    let isActive = true;

    (async () => {
      try {
        const data = await fetchMe();
        if (isActive) {
          setMe(data);
        }
      } catch (error) {
        if (isActive) {
          setError(error.message || 'Could not load your account.');
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [isLoaded, userId, reloadNonce, fetchMe]);

  useEffect(() => {
    if (!me?.user?.role) {
      return;
    }

    let isActive = true;

    (async () => {
      try {
        if (me.user.role === 'admin') {
          const data = await fetchAdminData();
          if (isActive) {
            setAdminData(data);
          }
          return;
        }

        const data = await fetchChildData();
        if (isActive) {
          setChildData(data);
        }
      } catch (error) {
        if (isActive) {
          setError(
            error.message || (me.user.role === 'admin'
              ? 'Could not load admin data.'
              : 'Could not load child assignments.')
          );
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [me, reloadNonce, fetchAdminData, fetchChildData]);

  useEffect(() => () => {
    clearAdvanceTimer();
  }, [clearAdvanceTimer]);

  async function startSession(assignmentId) {
    setError('');
    setNotice('');
    clearAdvanceTimer();

    try {
      const data = await api.startSession({ assignment_id: assignmentId });
      const cards = data.session.cards || [];
      startTimeRef.current = Date.now();
      setSessionState({
        id: data.session.id,
        cards,
        queue: cards.map((card) => card.word_id),
        activeAnswer: null,
        feedback: null,
        pendingAdvance: null,
        currentCardIndex: 0,
        totalCards: data.session.total_cards || cards.length,
        answeredCount: data.session.answered_count || 0,
        hintVisible: false,
        summary: null,
        profile: null,
        onClose: async () => {
          clearAdvanceTimer();
          setSessionState(null);
          setChildData(await fetchChildData());
        },
      });
    } catch (error) {
      setError(error.message || 'Could not start the session.');
    }
  }

  function showHint() {
    setSessionState((current) => (current ? { ...current, hintVisible: true } : current));
  }

  async function finishSession(options = {}) {
    if (!sessionState) {
      return;
    }

    clearAdvanceTimer();

    try {
      const result = await api.completeSession(sessionState.id, {});
      const nextChildData = await fetchChildData();
      setChildData(nextChildData);

      if (options.closeAfterComplete) {
        setSessionState(null);
        return;
      }

      setSessionState((current) => current ? {
        ...current,
        summary: result.session,
        profile: result.profile,
        cards: [],
        currentCardIndex: 0,
        activeAnswer: null,
        feedback: null,
        pendingAdvance: null,
      } : current);
    } catch (error) {
      setError(error.message || 'Could not finish the session.');
    }
  }

  function dismissFeedback() {
    clearAdvanceTimer();
    let shouldFinish = false;

    setSessionState((current) => {
      if (!current || !current.pendingAdvance) {
        return current;
      }

      shouldFinish = Boolean(current.pendingAdvance.shouldFinish);

      const nextState = {
        ...current,
        cards: current.pendingAdvance.nextCards,
        queue: current.pendingAdvance.nextQueue,
        activeAnswer: null,
        feedback: null,
        answeredCount: current.pendingAdvance.nextAnsweredCount,
        currentCardIndex: current.pendingAdvance.nextCardIndex,
        totalCards: current.pendingAdvance.nextTotalCards,
        hintVisible: false,
        pendingAdvance: null,
      };

      return nextState;
    });

    if (shouldFinish) {
      void finishSession();
      return;
    }

    startTimeRef.current = Date.now();
  }

  async function selectChoice(selectedIndex) {
    if (!sessionState) {
      return;
    }

    const wordId = sessionState.queue[sessionState.currentCardIndex];
    const card = sessionState.cards.find((item) => item.word_id === wordId);
    if (!card) {
      return;
    }

    const responseMs = Date.now() - startTimeRef.current;
    const correct = selectedIndex === card.correct_index;
    const answer = {
      selectedIndex,
      correct,
      hintUsed: sessionState.hintVisible,
      responseMs,
    };

    try {
      const result = await api.answerSession(sessionState.id, {
        word_id: wordId,
        selected_index: selectedIndex,
        hint_used: sessionState.hintVisible,
        response_ms: responseMs,
      });
      if (result?.profile) {
        setChildData((current) => current ? {
          ...current,
          profile: result.profile,
        } : current);
      }

      const nextCards = result?.session?.cards || [];
      const nextQueue = nextCards.map((nextCard) => nextCard.word_id);
      const shouldFinish = nextCards.length === 0;
      const nextAnsweredCount = result?.session?.answered_count ?? ((sessionState.answeredCount || 0) + 1);
      const nextTotalCards = result?.session?.total_cards ?? (nextAnsweredCount + nextCards.length);

      clearAdvanceTimer();
      setSessionState((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          activeAnswer: {
            wordId,
            ...answer,
          },
          feedback: {
            kind: correct ? 'right' : 'wrong',
            correctChoice: card.choices[card.correct_index],
          },
          pendingAdvance: {
            nextCards,
            nextQueue,
            nextCardIndex: 0,
            shouldFinish,
            nextAnsweredCount,
            nextTotalCards,
          },
        };
      });
    } catch (error) {
      setError(error.message || 'Could not save the answer.');
      return;
    }

    if (correct) {
      advanceTimerRef.current = window.setTimeout(() => {
        dismissFeedback();
        advanceTimerRef.current = 0;
      }, 500);
    }
  }

  return (
    <div className="app-shell">
      <Show when="signed-out">
        <div className="auth-shell">
          <section className="hero-panel">
            <p className="eyebrow">vocab</p>
            <h1>Pre-learn the hard words before the reading starts.</h1>
            <p>
              Admins import books or build word decks. Children log in to work through fast, low-friction meaning checks with light review.
            </p>
          </section>

          <section className="auth-panel">
            <SignIn />
          </section>
        </div>
      </Show>

      <Show when="signed-in">
        <main className="app-main">
          <ShellHeader
            role={me?.user?.role}
            name={user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Reader'}
            onRefresh={refreshAll}
          />

          {notice ? <p className="notice-banner">{notice}</p> : null}
          {error ? <p className="error-banner">{error}</p> : null}

          {!me ? (
            <section className="panel loading-panel">
              <p>Loading your workspace…</p>
            </section>
          ) : me.user.role === 'admin' ? (
            <AdminPanel
              api={api}
              adminData={adminData}
              onReload={refreshAll}
              setNotice={setNotice}
              setError={setError}
            />
          ) : childData.profile ? (
            <ChildPanel
              childData={childData}
              sessionState={sessionState}
              onStart={startSession}
              onSelectChoice={selectChoice}
              onShowHint={showHint}
              onDismissFeedback={dismissFeedback}
              onBackToAssignments={() => finishSession({ closeAfterComplete: true })}
            />
          ) : (
            <section className="panel loading-panel">
              <p>Loading child profile…</p>
            </section>
          )}
        </main>
      </Show>
    </div>
  );
}
