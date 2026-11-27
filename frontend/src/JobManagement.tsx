import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  FileJson,
  FileText,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

type StoredFile = {
  original_name: string;
  stored_name: string;
  content_type: string;
  size_bytes: number;
};

type ExecutionState = {
  started: boolean;
  provider_called: boolean;
  qc_passed: boolean;
  human_approval_required: boolean;
  publication_eligible: boolean;
};

type JobManifest = {
  schema_version: string;
  job_id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  revision?: number;
  archived?: boolean;
  archived_at?: string | null;
  duplicated_from?: string;
  source: StoredFile;
  references: StoredFile[];
  operations: string[];
  protected_elements: string[];
  provider: string;
  prompt_mode: string;
  prompt_original: string;
  prompt_prepared: string | null;
  template: string | null;
  execution: ExecutionState;
};

type JobSummary = {
  job_id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  revision?: number;
  archived?: boolean;
  source: StoredFile;
  operations: string[];
  provider: string;
  references_count: number;
};

type JobsResponse = { items: JobSummary[]; total: number };
type JobView = 'active' | 'archived' | 'all';
type EditDraft = {
  operations: string[];
  protected_elements: string[];
  provider: string;
  prompt_mode: string;
  prompt_original: string;
  template: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const OPERATIONS = [
  'Замена фона',
  'Улучшение освещения',
  'Редактирование товара',
  'Замена персонажа',
  'Добавить человека',
  'Обновление инфографики',
  'Замена FOOTER',
  'Полная переработка',
  'Создание нового имиджа',
];
const PROTECTED_OPTIONS = [
  'Товар и его конструкция',
  'Тексты и характеристики',
  'Логотип ELITECH®',
  'Фирменная нижняя плашка',
  'Знак гарантии',
  'Исходная композиция',
];
const PROVIDERS = [
  { id: 'magnific_nano_banana', label: 'Nano Banana · Magnific API' },
  { id: 'openai', label: 'ChatGPT / OpenAI' },
  { id: 'other', label: 'Другой AI-провайдер' },
];

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Черновик',
    READY: 'Готово к запуску',
    QUEUED: 'В очереди',
    PROCESSING: 'В обработке',
    GENERATED: 'Результат создан',
    QC_PASS: 'QC пройден',
    QC_FAIL: 'QC не пройден',
    APPROVED: 'Утверждено',
    REJECTED: 'Отклонено',
  };
  return labels[status] || status;
}

function providerLabel(provider: string) {
  const item = PROVIDERS.find(option => option.id === provider);
  return item?.label || provider;
}

function errorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

export default function JobManagement() {
  const [items, setItems] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobManifest | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<JobView>('active');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [error, setError] = useState('');

  async function loadJobs(preferredId?: string, requestedView: JobView = view) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (requestedView === 'archived') params.set('archived_only', 'true');
      if (requestedView === 'all') params.set('include_archived', 'true');
      const response = await fetch(API_BASE + '/api/jobs?' + params.toString());
      const data = await response.json() as JobsResponse;
      if (!response.ok) throw new Error(errorMessage(data, 'Не удалось получить список заданий (' + response.status + ')'));
      const nextItems = data.items || [];
      setItems(nextItems);
      setTotal(data.total || 0);
      setSelectedId(current => {
        if (preferredId && nextItems.some(item => item.job_id === preferredId)) return preferredId;
        if (current && nextItems.some(item => item.job_id === current)) return current;
        return nextItems[0]?.job_id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки истории заданий');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs(undefined, view);
  }, [view]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetail(null);
    fetch(API_BASE + '/api/jobs/' + encodeURIComponent(selectedId), { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data, 'Не удалось открыть задание (' + response.status + ')'));
        return data as JobManifest;
      })
      .then(data => setDetail(data))
      .catch(err => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Ошибка загрузки задания');
        }
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter(item =>
      [item.job_id, item.source.original_name, item.status, ...item.operations]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [items, query]);

  const fileUrl = (file: StoredFile) =>
    API_BASE + '/api/jobs/' + encodeURIComponent(detail?.job_id || '') + '/files/' + encodeURIComponent(file.stored_name);

  async function requestJob(path: string, method = 'POST', body?: unknown): Promise<JobManifest> {
    const response = await fetch(API_BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(errorMessage(data, 'Операция не выполнена (' + response.status + ')'));
    return data as JobManifest;
  }

  function beginEdit() {
    if (!detail) return;
    setEditDraft({
      operations: [...detail.operations],
      protected_elements: [...detail.protected_elements],
      provider: detail.provider,
      prompt_mode: detail.prompt_mode,
      prompt_original: detail.prompt_original,
      template: detail.template || '',
    });
    setEditing(true);
    setError('');
  }

  function toggleEditValue(field: 'operations' | 'protected_elements', value: string) {
    setEditDraft(current => {
      if (!current) return current;
      const values = current[field];
      return {
        ...current,
        [field]: values.includes(value) ? values.filter(item => item !== value) : [...values, value],
      };
    });
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !editDraft) return;
    setActionBusy(true);
    setError('');
    try {
      const updated = await requestJob(
        '/api/jobs/' + encodeURIComponent(detail.job_id),
        'PATCH',
        { ...editDraft, template: editDraft.template.trim() || null },
      );
      setDetail(updated);
      setEditing(false);
      setEditDraft(null);
      await loadJobs(updated.job_id, view);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setActionBusy(false);
    }
  }

  async function duplicateJob() {
    if (!detail) return;
    setActionBusy(true);
    setError('');
    try {
      const created = await requestJob('/api/jobs/' + encodeURIComponent(detail.job_id) + '/duplicate');
      setEditing(false);
      setEditDraft(null);
      setView('active');
      await loadJobs(created.job_id, 'active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось дублировать задание');
    } finally {
      setActionBusy(false);
    }
  }

  async function changeArchiveState(archive: boolean) {
    if (!detail) return;
    setActionBusy(true);
    setError('');
    try {
      const updated = await requestJob(
        '/api/jobs/' + encodeURIComponent(detail.job_id) + (archive ? '/archive' : '/restore'),
      );
      setDetail(updated);
      setEditing(false);
      setEditDraft(null);
      const nextView: JobView = archive ? 'archived' : 'active';
      setView(nextView);
      await loadJobs(updated.job_id, nextView);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить состояние архива');
    } finally {
      setActionBusy(false);
    }
  }

  function downloadManifest() {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = detail.job_id + '_job_manifest.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const draftCount = items.filter(item => item.status === 'DRAFT').length;
  const canEdit = !!detail
    && detail.status === 'DRAFT'
    && !detail.archived
    && !detail.execution.started
    && !detail.execution.provider_called;

  return (
    <section className="job-management">
      <div className="jm-heading">
        <div>
          <div className="eyebrow">JOB CONTROL CENTER</div>
          <h1>История <em>заданий</em></h1>
          <p>Все созданные задания, исходные материалы и технические задания — в одном месте.</p>
        </div>
        <button className="jm-refresh" onClick={() => void loadJobs()} disabled={loading || actionBusy}>
          <RefreshCw size={16} className={loading ? 'spin' : ''}/> Обновить
        </button>
      </div>

      <div className="jm-stats">
        <div className="jm-stat"><span>Заданий в разделе</span><b>{total}</b></div>
        <div className="jm-stat"><span>Черновики</span><b>{draftCount}</b></div>
        <div className="jm-stat"><span>AI-провайдеры подключены</span><b>0 <small>из 3</small></b></div>
        <div className="jm-stat"><span>Автопубликация</span><b className="jm-safe">Отключена</b></div>
      </div>

      {error && <div className="jm-error">{error}</div>}

      <div className="jm-layout">
        <section className="jm-list-panel">
          <div className="jm-list-head">
            <div><small>JOB QUEUE</small><h2>{view === 'archived' ? 'Архив' : view === 'all' ? 'Все задания' : 'Активные задания'} <span>{total}</span></h2></div>
          </div>
          <div className="jm-view-tabs" role="group" aria-label="Фильтр заданий">
            <button className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>Активные</button>
            <button className={view === 'archived' ? 'active' : ''} onClick={() => setView('archived')}>Архив</button>
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>Все</button>
          </div>
          <label className="jm-search">
            <Search size={16}/>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по ID, файлу или операции"/>
          </label>
          {loading ? <div className="jm-empty">Загружаем историю…</div> :
            filtered.length === 0 ? <div className="jm-empty">{items.length ? 'По запросу ничего не найдено.' : 'В этом разделе пока нет заданий.'}</div> :
            <div className="jm-items">{filtered.map(item => (
              <button className={'jm-item ' + (selectedId === item.job_id ? 'active' : '')} key={item.job_id} onClick={() => { setEditing(false); setEditDraft(null); setSelectedId(item.job_id); }}>
                <div className="jm-item-top">
                  <b>{item.job_id}</b>
                  <span className={'jm-status status-' + item.status.toLowerCase()}>{item.archived ? 'Архив' : statusLabel(item.status)}</span>
                </div>
                <div className="jm-file"><ImageIcon size={15}/><span>{item.source.original_name}</span></div>
                <div className="jm-item-ops">{item.operations.map(operation => <span key={operation}>{operation}</span>)}</div>
                <div className="jm-item-bottom">
                  <span><Clock3 size={12}/>{dateLabel(item.created_at)}</span>
                  <span>{item.references_count} реф.</span>
                </div>
              </button>
            ))}</div>
          }
        </section>

        <section className="jm-detail-panel">
          {!selectedId ? <div className="jm-empty jm-detail-empty"><FileText size={30}/><b>Выберите задание</b><span>Подробности и исходные материалы появятся здесь.</span></div> :
            detailLoading || !detail ? <div className="jm-empty jm-detail-empty">Загружаем карточку задания…</div> : <>
              <div className="jm-detail-head">
                <div><small>JOB DETAILS</small><h2>{detail.job_id}</h2><span>{dateLabel(detail.created_at)} · версия {detail.revision || 1}</span></div>
                <div className="jm-actions">
                  <button className="jm-download" onClick={downloadManifest}><FileJson size={15}/> Скачать JSON</button>
                  {canEdit && <button className="jm-action" onClick={beginEdit} disabled={actionBusy || editing}><Pencil size={14}/> Редактировать</button>}
                  <button className="jm-action" onClick={() => void duplicateJob()} disabled={actionBusy}><Copy size={14}/> Дублировать</button>
                  {detail.archived
                    ? <button className="jm-action" onClick={() => void changeArchiveState(false)} disabled={actionBusy}><ArchiveRestore size={14}/> Восстановить</button>
                    : <button className="jm-action danger" onClick={() => void changeArchiveState(true)} disabled={actionBusy}><Archive size={14}/> В архив</button>}
                </div>
              </div>

              <div className="jm-preview">
                {detail.source.content_type.startsWith('image/')
                  ? <img src={fileUrl(detail.source)} alt={detail.source.original_name}/>
                  : <div className="jm-file-placeholder"><FileText size={34}/>{detail.source.original_name}</div>}
              </div>
              <div className="jm-source-meta"><b>{detail.source.original_name}</b><span>{(detail.source.size_bytes / 1048576).toFixed(2)} МБ · {detail.source.content_type}</span></div>

              {editing && editDraft ? (
                <form className="jm-editor" onSubmit={saveEdit}>
                  <div className="jm-editor-heading"><div><small>EDIT DRAFT</small><h3>Редактирование задания</h3></div><span>Оригинал и референсы заблокированы</span></div>

                  <div className="jm-edit-field">
                    <b>Операции</b>
                    <div className="jm-edit-checks">
                      {OPERATIONS.map(operation => (
                        <label key={operation}>
                          <input type="checkbox" checked={editDraft.operations.includes(operation)} onChange={() => toggleEditValue('operations', operation)}/>
                          {operation}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="jm-edit-field">
                    <b>AI-провайдер</b>
                    <div className="jm-edit-providers">
                      {PROVIDERS.map(provider => (
                        <label key={provider.id}>
                          <input type="radio" name="edit-provider" checked={editDraft.provider === provider.id} onChange={() => setEditDraft(current => current ? { ...current, provider: provider.id } : current)}/>
                          {provider.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="jm-edit-field">
                    <b>Защищённые элементы</b>
                    <div className="jm-edit-checks">
                      {PROTECTED_OPTIONS.map(option => (
                        <label key={option}>
                          <input type="checkbox" checked={editDraft.protected_elements.includes(option)} onChange={() => toggleEditValue('protected_elements', option)}/>
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="jm-edit-field">
                    <b>Режим промпта</b>
                    <select value={editDraft.prompt_mode} onChange={event => setEditDraft(current => current ? { ...current, prompt_mode: event.target.value } : current)}>
                      <option value="manual">Самостоятельно</option>
                      <option value="assist">Помощь ChatGPT</option>
                      <option value="template">Готовый шаблон</option>
                    </select>
                  </div>

                  <div className="jm-edit-field">
                    <b>Техническое задание / промпт</b>
                    <textarea value={editDraft.prompt_original} onChange={event => setEditDraft(current => current ? { ...current, prompt_original: event.target.value } : current)} rows={7} maxLength={20000}/>
                  </div>

                  <div className="jm-edit-field">
                    <b>Название шаблона (необязательно)</b>
                    <input value={editDraft.template} onChange={event => setEditDraft(current => current ? { ...current, template: event.target.value } : current)} maxLength={200}/>
                  </div>

                  <div className="jm-editor-actions">
                    <button className="jm-action" type="button" onClick={() => { setEditing(false); setEditDraft(null); }} disabled={actionBusy}><X size={14}/> Отмена</button>
                    <button className="jm-save" type="submit" disabled={actionBusy || !editDraft.operations.length || !editDraft.prompt_original.trim()}>
                      <Check size={14}/> {actionBusy ? 'Сохраняем…' : 'Сохранить изменения'}
                    </button>
                  </div>
                  <p className="jm-editor-note">Сохранение создаст новую ревизию и запись в журнале изменений. Исходный файл не изменяется.</p>
                </form>
              ) : (
                <>
                  <div className="jm-section">
                    <h3>Параметры обработки</h3>
                    <div className="jm-kv"><span>Статус</span><b>{statusLabel(detail.status)}{detail.archived ? ' · Архив' : ''}</b></div>
                    <div className="jm-kv"><span>AI-провайдер</span><b>{providerLabel(detail.provider)}</b></div>
                    <div className="jm-kv"><span>Режим промпта</span><b>{detail.prompt_mode}</b></div>
                    <div className="jm-chips">{detail.operations.map(value => <span key={value}>{value}</span>)}</div>
                  </div>
                  <div className="jm-section"><h3>Техническое задание</h3><pre className="jm-prompt">{detail.prompt_original}</pre></div>
                  <div className="jm-section">
                    <h3><ShieldCheck size={15}/> Защищённые элементы</h3>
                    <div className="jm-protected">{detail.protected_elements.map(value => <span key={value}>{value}</span>)}</div>
                  </div>
                  <div className="jm-section">
                    <h3>Референсы <span className="jm-muted">({detail.references.length})</span></h3>
                    {detail.references.length === 0 ? <div className="jm-no-refs">Дополнительные материалы не загружались.</div> :
                      <div className="jm-references">{detail.references.map(file => (
                        <a className="jm-reference" href={fileUrl(file)} target="_blank" rel="noreferrer" key={file.stored_name}>
                          {file.content_type.startsWith('image/') ? <img src={fileUrl(file)} alt={file.original_name}/> : <FileText size={25}/>}
                          <span>{file.original_name}</span><ExternalLink size={12}/>
                        </a>
                      ))}</div>}
                  </div>
                  <div className="jm-execution">
                    <div><b>Вызов AI-провайдера</b><span>{detail.execution.provider_called ? 'Выполнен' : 'Не выполнялся'}</span></div>
                    <div><b>Проверка QC</b><span>{detail.execution.qc_passed ? 'Пройдена' : 'Не выполнялась'}</span></div>
                    <div><b>Согласование человеком</b><span>{detail.execution.human_approval_required ? 'Обязательно' : 'Не требуется'}</span></div>
                    <div><b>Публикация</b><span>{detail.execution.publication_eligible ? 'Разрешена' : 'Заблокирована'}</span></div>
                  </div>
                  <div className="jm-notice">
                    Оригинал и референсы неизменяемы. Редактирование доступно только для черновиков, которые ещё не запускались. Все изменения фиксируются в журнале.
                  </div>
                </>
              )}
            </>}
        </section>
      </div>
    </section>
  );
}
