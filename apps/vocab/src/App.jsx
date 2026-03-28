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
        <h1>{role === 'admin' ? 'Book Prep Console' : 'Today’s Word Run'}</h1>
        <p className="subtitle">
          {role === 'admin'
            ? 'Import books, publish review decks, and assign them to children.'
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
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('en');
  const [generateImages, setGenerateImages] = useState(false);
  const [textFile, setTextFile] = useState(null);
  const [ocrFiles, setOcrFiles] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [enableHints, setEnableHints] = useState(true);
  const [enableImages, setEnableImages] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState('');
  const [importJobs, setImportJobs] = useState(adminData.importJobs || []);
  const [trackedImportJobId, setTrackedImportJobId] = useState('');

  const upsertImportJob = useCallback((job) => {
    setImportJobs((currentJobs) => mergeImportJobs(currentJobs, job));
  }, []);

  useEffect(() => {
    if (!selectedBookId && adminData.books[0]) {
      setSelectedBookId(adminData.books[0].id);
    }
    if (!selectedChildId && adminData.children[0]) {
      setSelectedChildId(adminData.children[0].user_id);
    }
  }, [adminData.books, adminData.children, selectedBookId, selectedChildId]);

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
          setNotice(`Book import completed: ${nextJob.title}.`);
          onReload();
          return;
        }

        if (nextJob.status === 'failed') {
          setTrackedImportJobId('');
          setError(nextJob.message || 'Book import failed.');
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
        title,
        author,
        language,
        text: text.trim(),
        text_file: !text.trim() ? textFile : null,
        ocr_files: sortFilesByName(ocrFiles),
        generate_images: generateImages,
      });

      setTitle('');
      setAuthor('');
      setText('');
      setTextFile(null);
      setOcrFiles([]);
      setGenerateImages(false);
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
    if (!selectedBookId || !selectedChildId) {
      setError('Choose both a book and a child profile before assigning.');
      return;
    }

    setAssignBusy(true);
    setError('');
    setNotice('');
    try {
      await api.createAssignment({
        book_id: selectedBookId,
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
      setNotice(`Hints ${assignment.settings?.hints_enabled ? 'disabled' : 'enabled'} for ${assignment.book?.title || 'the assignment'}.`);
      await onReload();
    } catch (error) {
      setError(error.message || 'Could not update assignment settings.');
    } finally {
      setUpdatingAssignmentId('');
    }
  }

  const publishedBooks = adminData.books.filter((book) => book.status === 'published');
  const recentImportJobs = importJobs.slice(0, 8);

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
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>

          <label className="field">
            <span>Author</span>
            <input value={author} onChange={(event) => setAuthor(event.target.value)} />
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
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste plain text here, or leave this blank and upload a .txt file or page photos."
            />
          </label>

          <label className="field">
            <span>Plain Text File</span>
            <input
              type="file"
              accept=".txt,text/plain"
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
              checked={generateImages}
              onChange={(event) => setGenerateImages(event.target.checked)}
            />
            <span>Generate illustrations for imported words when available</span>
          </label>

          <button type="submit" className="primary-button" disabled={importBusy}>
            {importBusy ? 'Starting…' : 'Start Import'}
          </button>
        </form>
      </section>

      <section className="panel assign-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Assign</p>
            <h2>Create A Practice Deck</h2>
          </div>
          <span className="panel-chip">{publishedBooks.length} published books</span>
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
            <span>Book</span>
            <select value={selectedBookId} onChange={(event) => setSelectedBookId(event.target.value)}>
              <option value="">Choose a published book</option>
              {publishedBooks.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
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
            {assignBusy ? 'Assigning…' : 'Assign Book'}
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
                  Active assignments: {child.assignments.length}
                </p>
                {child.assignments.length > 0 ? (
                  <div className="assignment-admin-list">
                    {child.assignments.map((assignment) => (
                      <div key={assignment.id} className="assignment-admin-row">
                        <div>
                          <p className="assignment-admin-title">{assignment.book?.title || 'Assigned book'}</p>
                          <p className="assignment-admin-meta">
                            Hints {assignment.settings?.hints_enabled ? 'on' : 'off'} • Images {assignment.settings?.images_enabled ? 'on' : 'off'}
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

function ChildPanel({ childData, sessionState, onStart, onSelectChoice, onShowHint, onDismissFeedback, onStopSession }) {
  const currentWordId = sessionState?.queue?.[sessionState.currentCardIndex] || null;
  const currentCard = currentWordId
    ? sessionState?.cards?.find((card) => card.word_id === currentWordId) || null
    : null;
  const currentAnswer = currentCard && sessionState?.activeAnswer?.wordId === currentCard.word_id
    ? sessionState.activeAnswer
    : null;
  const visibleAnsweredCount = (sessionState?.answeredCount || 0) + (sessionState?.feedback ? 1 : 0);
  const visibleRemainingCount = sessionState?.pendingAdvance
    ? sessionState.pendingAdvance.nextQueue.length
    : (sessionState?.queue?.length || 0);
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
      <section className="panel child-session-panel">
        <div className="session-progress">
          <div className="session-progress-head">
            <p className="eyebrow">Live Session</p>
            <button type="button" className="ghost-button session-stop-button" onClick={onStopSession}>
              Stop
            </button>
          </div>
          <div className="progress-rail">
            <div
              className="progress-fill"
              style={{ width: `${Math.max(8, Math.round((visibleAnsweredCount / sessionState.totalCards) * 100))}%` }}
            />
          </div>
          <p>
            {visibleAnsweredCount} answered • {visibleRemainingCount} left for now
          </p>
        </div>

        <article key={currentCard.word_id} className="word-card">
          <p className="word-label">Word</p>
          <h2>{currentCard.lemma}</h2>
          {currentCard.image_url ? (
            <img className="word-image" src={currentCard.image_url} alt={currentCard.lemma} />
          ) : null}

          {currentCard.hint ? (
            <div className="hint-strip">
              {sessionState.hintVisible ? (
                <p>{currentCard.hint}</p>
              ) : (
                <button type="button" className="ghost-button" onClick={onShowHint}>
                  Show Hint
                </button>
              )}
            </div>
          ) : null}

          <div className="choice-grid">
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
                <div>
                  <p className="session-feedback-title">Right</p>
                </div>
              </div>
            ) : (
              <div className="session-feedback-screen" role="dialog" aria-modal="true" aria-labelledby="wrong-word-title">
                <div className="session-feedback-panel">
                  <p className="session-feedback-kicker">This one is still new. Here is a gentler look at the word.</p>
                  <h3 id="wrong-word-title" className="session-feedback-word">{currentCard?.lemma}</h3>
                  <div className="session-feedback-block">
                    <p className="session-feedback-label">Correct definition</p>
                    <p className="session-feedback-definition">{currentDefinition}</p>
                  </div>
                  {currentUsageExamples.length > 0 ? (
                    <div className="session-feedback-block session-feedback-examples">
                      <p className="session-feedback-label">How it can sound in a sentence</p>
                      <ul className="session-feedback-example-list">
                        {currentUsageExamples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <button type="button" className="primary-button session-feedback-button-primary" onClick={onDismissFeedback}>
                    Back to cards
                  </button>
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
            <h2>Ready Books</h2>
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
                    <h3>{assignment.book.title}</h3>
                    <p>{assignment.book.author || 'Unknown author'}</p>
                  </div>
                  <span className="status-pill status-live">
                    {assignment.progress.mastered_count}/{assignment.progress.total_target_words}
                  </span>
                </div>
                <p>
                  Due now {assignment.progress.due_count} • Learning {assignment.progress.learning_count}
                </p>
                <p>
                  Hints {assignment.settings.hints_enabled ? 'on' : 'off'} • Images {assignment.settings.images_enabled ? 'on' : 'off'}
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
  const [adminData, setAdminData] = useState({ books: [], children: [], importJobs: [] });
  const [childData, setChildData] = useState({ assignments: [], profile: null });
  const [sessionState, setSessionState] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const startTimeRef = useRef(0);
  const advanceTimerRef = useRef(0);

  const fetchMe = useCallback(() => api.getMe(), [api]);

  const fetchAdminData = useCallback(async () => {
    const [booksData, childrenData] = await Promise.all([
      api.getAdminBooks(),
      api.getChildren(),
    ]);
    return {
      books: booksData.books || [],
      children: childrenData.children || [],
      importJobs: booksData.import_jobs || [],
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

  async function finishSession() {
    if (!sessionState) {
      return;
    }

    clearAdvanceTimer();

    try {
      const result = await api.completeSession(sessionState.id, {});
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
      setChildData(await fetchChildData());
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
      }, 2000);
    }
  }

  return (
    <div className="app-shell">
      <Show when="signed-out">
        <div className="auth-shell">
          <section className="hero-panel">
            <p className="eyebrow">vocab</p>
            <h1>Pre-learn the hard words before the book opens.</h1>
            <p>
              Admins import books and publish practice decks. Children log in to work through fast, low-friction meaning checks with light review.
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
              onStopSession={finishSession}
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
