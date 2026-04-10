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

function deckSecondaryText(deck) {
  if (!deck) {
    return '';
  }
  if (deck.type === 'book') {
    return deck.author || 'Imported book';
  }
  return deck.description || `${deck.word_count || 0} pasted words`;
}

function buildDeckGeneratorPrompt({ topic, readingLevel, wordCount }) {
  const normalizedTopic = String(topic || '').trim() || 'general everyday vocabulary';
  const normalizedReadingLevel = String(readingLevel || '').trim() || 'early elementary';
  const normalizedWordCount = Math.max(1, Number(wordCount) || 20);

  return `Generate a vocabulary deck for children.

Topic: ${normalizedTopic}
Reading level: ${normalizedReadingLevel}
Number of words: ${normalizedWordCount}

Return only plain text rows with tab-separated columns in this exact format:
word<TAB>definition<TAB>wrong choice 1<TAB>wrong choice 2<TAB>wrong choice 3

Rules:
- Produce exactly ${normalizedWordCount} rows
- One word per line
- Match the topic and reading level
- Use short, concrete, child-friendly definitions
- Wrong choices should be plausible meanings, not nonsense
- Avoid duplicate words
- Do not number the rows
- Do not use markdown
- Do not add any explanation before or after the rows

Example:
curious\twanting to know more\tready for bed\tmade of metal\teasy to spill`;
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
            ? 'Import books, build word decks, and assign the right practice queue to each child.'
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
  const [deckGenerateImages, setDeckGenerateImages] = useState(false);
  const [deckPromptTopic, setDeckPromptTopic] = useState('');
  const [deckPromptReadingLevel, setDeckPromptReadingLevel] = useState('early elementary');
  const [deckPromptWordCount, setDeckPromptWordCount] = useState('20');
  const [deckPromptCopied, setDeckPromptCopied] = useState(false);
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
          setNotice(`${nextJob.job_type === 'deck' ? 'Deck ready' : 'Book import completed'}: ${nextJob.title}.`);
          onReload();
          return;
        }

        if (nextJob.status === 'failed') {
          setTrackedImportJobId('');
          setError(nextJob.message || (nextJob.job_type === 'deck' ? 'Deck build failed.' : 'Book import failed.'));
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
      const data = await api.createDeck({
        title: deckTitle,
        description: deckDescription,
        language: 'en',
        words_text: deckWords,
        generate_images: deckGenerateImages,
      });

      setDeckTitle('');
      setDeckDescription('');
      setDeckWords('');
      setDeckGenerateImages(false);
      if (data?.job) {
        upsertImportJob(data.job);
        setTrackedImportJobId(data.job.id);
      }
      setNotice('Deck build started. This page will update when it is ready.');
    } catch (error) {
      setError(error.message || 'Deck build failed.');
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
    if (!selectedDeckId || !selectedChildId) {
      setError('Choose both a deck and a child profile before assigning.');
      return;
    }

    setAssignBusy(true);
    setError('');
    setNotice('');
    try {
      await api.createAssignment({
        deck_id: selectedDeckId,
        child_user_id: selectedChildId,
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

  const publishedDecks = adminData.decks.filter((deck) => deck.status === 'published');
  const customDecks = adminData.decks.filter((deck) => deck.type !== 'book');
  const recentImportJobs = importJobs.slice(0, 8);
  const selectedProfileChild = adminData.children.find((child) => child.user_id === selectedProfileChildId) || null;
  const deckGeneratorPrompt = useMemo(() => buildDeckGeneratorPrompt({
    topic: deckPromptTopic,
    readingLevel: deckPromptReadingLevel,
    wordCount: deckPromptWordCount,
  }), [deckPromptReadingLevel, deckPromptTopic, deckPromptWordCount]);

  return (
    <div className="workspace-grid">
      <section className="panel import-panel">
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

      <section className="panel import-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Word Deck</p>
            <h2>Build From A Word List</h2>
          </div>
          <span className="panel-chip">Copy and paste</span>
        </div>

        <form className="stack" onSubmit={handleCreateDeck}>
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
                <select
                  value={deckPromptReadingLevel}
                  onChange={(event) => setDeckPromptReadingLevel(event.target.value)}
                >
                  <option value="early elementary">Early Elementary</option>
                  <option value="late elementary">Late Elementary</option>
                  <option value="middle grade">Middle Grade</option>
                </select>
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
            <textarea
              className="prompt-helper-text"
              rows={10}
              value={deckGeneratorPrompt}
              readOnly
            />
          </div>

          <label className="field">
            <span>Words</span>
            <textarea
              rows={8}
              value={deckWords}
              onChange={(event) => setDeckWords(event.target.value)}
              placeholder={'big\tvery large\ttiny\tvery loud\tfull of water\ncurious\twanting to know more\tready for bed\tmade of metal\teasy to spill'}
              required
            />
          </label>

          <p className="form-note">
            Paste either a simple word list, or one word per line with tab-separated columns:
            word, definition, wrong choice 1, wrong choice 2, wrong choice 3.
            Optional extra columns: hint, example 1, example 2. Pipe separators also work.
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
            {deckBusy ? 'Starting…' : 'Build Deck'}
          </button>
        </form>
      </section>

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

      <section className="panel list-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Decks</p>
            <h2>Curated Word Decks</h2>
          </div>
        </div>

        <div className="card-list">
          {customDecks.length === 0 ? (
            <p className="empty-state">No custom word decks yet.</p>
          ) : (
            customDecks.map((deck) => (
              <article key={deck.id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h3>{deck.title}</h3>
                    <p>{deckSecondaryText(deck)}</p>
                  </div>
                  <span className={`status-pill status-${deck.status}`}>{deck.status}</span>
                </div>
                <p>
                  {deck.word_ids.length} words • {formatDeckType(deck)}
                </p>
                <div className="token-row">
                  {deck.words.slice(0, 8).map((word) => (
                    <span key={word.id} className="token">
                      {word.lemma}
                    </span>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel list-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Books</p>
            <h2>Library</h2>
          </div>
        </div>

        <div className="card-list">
          {adminData.books.length === 0 ? (
            <p className="empty-state">No books imported yet.</p>
          ) : (
            adminData.books.map((book) => (
              <article key={book.id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h3>{book.title}</h3>
                    <p>{book.author || 'Unknown author'}</p>
                  </div>
                  <span className={`status-pill status-${book.status}`}>{book.status}</span>
                </div>
                <p>
                  {book.word_ids.length} pool words • {book.word_count} words in source • {book.page_images?.length || 0} page images • {book.artifacts?.length || 0} artifacts
                </p>
                <div className="token-row">
                  {book.words.slice(0, 8).map((word) => (
                    <span key={word.id} className="token">
                      {word.lemma}
                    </span>
                  ))}
                </div>
                {book.status !== 'published' ? (
                  <button type="button" className="ghost-button" onClick={() => handlePublish(book.id)}>
                    Publish
                  </button>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel list-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Children</p>
            <h2>Profiles</h2>
          </div>
        </div>

        <div className="card-list">
          {adminData.children.length === 0 ? (
            <p className="empty-state">No child users found in Clerk yet.</p>
          ) : (
            adminData.children.map((child) => (
              <article key={child.user_id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h3>{child.display_name}</h3>
                    <p>{child.email}</p>
                  </div>
                  <span className="status-pill status-live">{formatBand(child.profile.target_band)}</span>
                </div>
                <p>
                  Known {child.profile.known_word_ids.length} • Learning {child.profile.learning_word_ids.length} • Struggling {child.profile.struggling_word_ids.length}
                </p>
                <p>
                  Window {child.profile.adaptive_settings?.rolling_band_window || 8} • Judge after {child.profile.adaptive_settings?.band_adjustment_min_answers || 3} • Recheck every {child.profile.adaptive_settings?.band_adjustment_step || 2}
                </p>
                <p>
                  Active assignments: {child.assignments.length}
                </p>
                {child.assignments.length > 0 ? (
                  <div className="assignment-admin-list">
                    {child.assignments.map((assignment) => (
                      <div key={assignment.id} className="assignment-admin-row">
                        <div>
                          <p className="assignment-admin-title">{assignment.deck?.title || 'Assigned deck'}</p>
                          <p className="assignment-admin-meta">
                            {formatDeckType(assignment.deck)} • Hints {assignment.settings?.hints_enabled ? 'on' : 'off'} • Images {assignment.settings?.images_enabled ? 'on' : 'off'}
                          </p>
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
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
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
