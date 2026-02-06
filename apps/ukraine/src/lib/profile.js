function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ewma(previous, next, alpha = 0.25) {
  return previous * (1 - alpha) + next * alpha;
}

export function computeBands(skillLevel) {
  const skill = clamp(skillLevel, 0, 100);
  return {
    comfort_band: [clamp(skill - 6, 0, 100), clamp(skill + 4, 0, 100)],
    instructional_band: [clamp(skill + 4, 0, 100), clamp(skill + 12, 0, 100)],
    frustration_band: [clamp(skill + 12, 0, 100), 100],
  };
}

export function defaultProfile(language) {
  const skillLevel = 25;
  return {
    child_id: 'single-child',
    language,
    skill_level: skillLevel,
    ...computeBands(skillLevel),
    confidence: 0.2,
    trend_7d: 0,
    trend_30d: 0,
    bottleneck: 'balanced',
    signals: {
      help_taps_per_100_words: 0,
      quiz_accuracy: 0,
      abandon_rate: 0,
      pace_wpm_proxy: 70,
    },
    recommended: {
      text_types: ['short dialogue-heavy stories', 'gentle everyday stories'],
      activities: ['read passage (3 min)', '2 quick comprehension questions'],
      daily_plan: {
        challenges_per_day: 4,
        mix: {
          comfort: 0.7,
          instructional: 0.3,
          challenge: 0,
        },
      },
    },
    history: [],
    updated_ts: new Date().toISOString(),
  };
}

export function normalizeProfile(profile, language) {
  const fallback = defaultProfile(language);
  const merged = {
    ...fallback,
    ...(profile || {}),
    signals: {
      ...fallback.signals,
      ...(profile?.signals || {}),
    },
    recommended: {
      ...fallback.recommended,
      ...(profile?.recommended || {}),
      daily_plan: {
        ...fallback.recommended.daily_plan,
        ...(profile?.recommended?.daily_plan || {}),
        mix: {
          ...fallback.recommended.daily_plan.mix,
          ...(profile?.recommended?.daily_plan?.mix || {}),
        },
      },
    },
    history: Array.isArray(profile?.history) ? profile.history : [],
  };

  const bands = computeBands(Number(merged.skill_level) || 25);
  merged.skill_level = clamp(Number(merged.skill_level) || 25, 0, 100);
  merged.comfort_band = bands.comfort_band;
  merged.instructional_band = bands.instructional_band;
  merged.frustration_band = bands.frustration_band;
  merged.confidence = clamp(Number(merged.confidence) || 0.2, 0, 1);
  merged.language = language;

  return merged;
}

function scoreBehavior(summary) {
  const help = clamp((Number(summary.help_taps_per_100_words) || 0) / 12, 0, 1);
  const repeat = clamp(Number(summary.repeat_rate) || 0, 0, 1);
  const pause = clamp(Number(summary.pause_density) || 0, 0, 1);
  const abandon = clamp(Number(summary.abandon_rate) || 0, 0, 1);
  const pace = clamp((Number(summary.pace_wpm_proxy) || 60) / 120, 0, 1);

  const strugglePenalty = (help * 0.35) + (repeat * 0.2) + (pause * 0.2) + (abandon * 0.25);
  const paceContribution = pace * 0.2;

  return clamp(1 - strugglePenalty + paceContribution, 0, 1);
}

export function classifyBottleneck(signals) {
  if ((signals.help_taps_per_100_words || 0) > 7 || (signals.pace_wpm_proxy || 0) < 55) {
    return 'decoding_limited';
  }

  if ((signals.quiz_accuracy || 0) < 0.55) {
    return 'comprehension_limited';
  }

  if ((signals.abandon_rate || 0) > 0.2) {
    return 'stamina_limited';
  }

  return 'balanced';
}

function getRecommendations(profile, bottleneck) {
  const recommendations = {
    text_types: [],
    activities: [],
    daily_plan: {
      challenges_per_day: 4,
      mix: {
        comfort: 0.7,
        instructional: 0.3,
        challenge: 0,
      },
    },
  };

  if (bottleneck === 'decoding_limited') {
    recommendations.text_types = [
      'short dialogue-heavy stories',
      'repetitive folktale-style passages',
      'low rare-word passages',
    ];
    recommendations.activities = [
      'tap and replay hard words',
      'slow sentence replay',
      'short read + 2 comprehension checks',
    ];
  } else if (bottleneck === 'comprehension_limited') {
    recommendations.text_types = [
      'clear sequence stories',
      'slightly easier vocabulary with richer plot',
      'short cause-and-effect passages',
    ];
    recommendations.activities = [
      'extra picture-backed questions',
      'brief retell prompt after reading',
      'fewer difficult words per passage',
    ];
  } else if (bottleneck === 'stamina_limited') {
    recommendations.text_types = [
      'very short complete stories',
      'high-interest short scenes',
      'split passages with fast wins',
    ];
    recommendations.activities = [
      '2-minute reading blocks',
      'one challenge per sitting',
      'quick celebration after each completion',
    ];
    recommendations.daily_plan.challenges_per_day = 3;
    recommendations.daily_plan.mix = {
      comfort: 0.8,
      instructional: 0.2,
      challenge: 0,
    };
  } else {
    recommendations.text_types = [
      'mixed narrative passages',
      'dialogue + descriptive balance',
      'slightly varied sentence lengths',
    ];
    recommendations.activities = [
      'read passage + comprehension',
      'occasional sentence replay',
      'steady daily routine',
    ];
  }

  if (profile.confidence > 0.75 && bottleneck === 'balanced') {
    recommendations.daily_plan.mix = {
      comfort: 0.6,
      instructional: 0.3,
      challenge: 0.1,
    };
  }

  return recommendations;
}

function computeTrend(history, days) {
  if (!Array.isArray(history) || history.length < 2) {
    return 0;
  }

  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const filtered = history.filter((entry) => {
    const ts = new Date(entry.ts).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });

  if (filtered.length < 2) {
    return 0;
  }

  const startSkill = Number(filtered[0].skill_level) || 0;
  const endSkill = Number(filtered[filtered.length - 1].skill_level) || 0;
  return Number((endSkill - startSkill).toFixed(2));
}

export function scorePerformance(summary) {
  const behaviorScore = scoreBehavior(summary);

  let performance;
  if ((summary.quiz_count || 0) > 0) {
    performance = clamp((summary.quiz_accuracy * 0.6) + (behaviorScore * 0.4), 0, 1);
  } else {
    performance = clamp(behaviorScore * 0.85, 0, 1);
  }

  if ((summary.duration_sec || 0) > 0 && (summary.duration_sec || 0) < 60) {
    performance = performance * 0.35;
  }

  return performance;
}

export function updateProfileFromSummary(profile, summary, endTs) {
  const current = normalizeProfile(profile, profile.language);
  const performance = scorePerformance(summary);
  const oldSkill = Number(current.skill_level) || 25;
  const difficulty = Number(summary.text_difficulty) || oldSkill;

  const informativeness = Math.exp(-Math.abs(difficulty - oldSkill) / 18);
  const candidateSkill = oldSkill + (8 * (performance - 0.75) * informativeness);
  const smoothedSkill = clamp((0.7 * oldSkill) + (0.3 * candidateSkill), 0, 100);

  const confidenceBoost = clamp((summary.word_count || 0) / 500, 0, 1) * 0.08 + ((summary.quiz_count || 0) > 0 ? 0.04 : 0);
  const confidencePenalty = ((summary.duration_sec || 0) < 60 ? 0.06 : 0) + ((summary.tts_only_ratio || 0) * 0.04);
  const newConfidence = clamp((Number(current.confidence) || 0.2) + confidenceBoost - confidencePenalty, 0.1, 0.99);

  const signals = {
    help_taps_per_100_words: Number(ewma(Number(current.signals?.help_taps_per_100_words) || 0, Number(summary.help_taps_per_100_words) || 0, 0.3).toFixed(2)),
    quiz_accuracy: Number(ewma(Number(current.signals?.quiz_accuracy) || 0, Number(summary.quiz_accuracy) || 0, 0.35).toFixed(3)),
    abandon_rate: Number(ewma(Number(current.signals?.abandon_rate) || 0, Number(summary.abandon_rate) || 0, 0.3).toFixed(3)),
    pace_wpm_proxy: Number(ewma(Number(current.signals?.pace_wpm_proxy) || 70, Number(summary.pace_wpm_proxy) || 70, 0.25).toFixed(1)),
  };

  const history = Array.isArray(current.history) ? [...current.history] : [];
  history.push({
    ts: endTs,
    skill_level: Number(smoothedSkill.toFixed(2)),
    performance: Number(performance.toFixed(3)),
    difficulty,
  });

  const historyCutoff = Date.now() - (45 * 24 * 60 * 60 * 1000);
  const boundedHistory = history.filter((entry) => {
    const ts = new Date(entry.ts).getTime();
    return Number.isFinite(ts) && ts >= historyCutoff;
  });

  const updated = {
    ...current,
    skill_level: Number(smoothedSkill.toFixed(2)),
    confidence: Number(newConfidence.toFixed(3)),
    signals,
    history: boundedHistory,
    trend_7d: computeTrend(boundedHistory, 7),
    trend_30d: computeTrend(boundedHistory, 30),
    updated_ts: endTs,
  };

  updated.bottleneck = classifyBottleneck(signals);
  const bands = computeBands(updated.skill_level);
  updated.comfort_band = bands.comfort_band;
  updated.instructional_band = bands.instructional_band;
  updated.frustration_band = bands.frustration_band;
  updated.recommended = getRecommendations(updated, updated.bottleneck);

  return updated;
}

export function toPublicProfile(profile, language) {
  const shaped = normalizeProfile(profile, language);
  const publicProfile = { ...shaped };
  delete publicProfile.history;
  return publicProfile;
}
