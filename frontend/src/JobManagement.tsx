import { useEffect, useMemo, useState } from 'react';
import { Clock3, ExternalLink, FileJson, FileText, Image as ImageIcon, RefreshCw, Search, ShieldCheck } from 'lucide-react';

type StoredFile = { original_name: string; stored_name: string; content_type: string; size_bytes: number };
type JobManifest = {
  schema_version: string; job_id: string; status: string; created_at: string;
  source: StoredFile; references: StoredFile[]; operations: string[]; protected_elements: string[];
  provider: string; prompt_mode: string; prompt_original: string; prompt_prepared: string | null;
  template: string | null;
  execution: { started: boolean; provider_called: boolean; qc_passed: boolean; human_approval_required: boolean; publication_eligible: boolean };
};
type JobSummary = { job_id: string; status: string; created_at: string; source: StoredFile; operations: string[]; provider: string; references_count: number };
type JobsResponse = { items: JobSummary[]; total: number };
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}
function statusLabel(status: string) {
  const labels: Record<string, string> = { DRAFT: 'Черновик', READY: 'Готово к запуску', QUEUED: 'В очереди', PROCESSING: 'В обработке', GENERATED: 'Результат создан', QC_PASS: 'QC пройден', QC_FAIL: 'QC не пройден', APPROVED: 'Утверждено', REJECTED: 'Отклонено' };
  return labels[status] || status;
}
function providerLabel(provider: string) {
  const labels: Record<string, string> = { magnific_nano_banana: 'Nano Banana · Magnific API', openai: 'ChatGPT / OpenAI', other: 'Другой AI-провайдер' };
  return labels[provider] || provider;
}

export default function JobManagement() {
  const [items, setItems] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobManifest | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadJobs() {
    setLoading(true); setError('');
    try {
      const response = await fetch(API_BASE + '/api/jobs?limit=200');
      if (!response.ok) throw new Error('Не удалось получить список заданий (' + response.status + ')');
      const data = await response.json() as JobsResponse;
      setItems(data.items || []); setTotal(data.total || 0);
      setSelectedId(current => current && (data.items || []).some(item => item.job_id === current) ? current : (data.items?.[0]?.job_id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки истории заданий');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadJobs(); }, []);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    const controller = new AbortController();
    setDetailLoading(true); setDetail(null);
    fetch(API_BASE + '/api/jobs/' + encodeURIComponent(selectedId), { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Не удалось открыть задание (' + response.status + ')'); return response.json() as Promise<JobManifest>; })
      .then(data => setDetail(data))
      .catch(err => { if (err.name !== 'AbortError') setError(err instanceof Error ? err.message : 'Ошибка загрузки задания'); })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter(item => [item.job_id, item.source.original_name, item.status, ...item.operations].join(' ').toLowerCase().includes(normalized));
  }, [items, query]);

  const fileUrl = (file: StoredFile) => API_BASE + '/api/jobs/' + encodeURIComponent(detail?.job_id || '') + '/files/' + encodeURIComponent(file.stored_name);
  function downloadManifest() {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = detail.job_id + '_job_manifest.json'; anchor.click();
    URL.revokeObjectURL(url);
  }
  const draftCount = items.filter(item => item.status === 'DRAFT').length;

  return (
    <section className="job-management">
      <div className="jm-heading">
        <div><div className="eyebrow">JOB CONTROL CENTER</div><h1>История <em>заданий</em></h1><p>Все созданные задания, исходные материалы и технические задания — в одном месте.</p></div>
        <button className="jm-refresh" onClick={() => void loadJobs()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> Обновить</button>
      </div>
      <div className="jm-stats">
        <div className="jm-stat"><span>Всего заданий</span><b>{total}</b></div>
        <div className="jm-stat"><span>Черновики</span><b>{draftCount}</b></div>
        <div className="jm-stat"><span>AI-провайдеры подключены</span><b>0 <small>из 3</small></b></div>
        <div className="jm-stat"><span>Автопубликация</span><b className="jm-safe">Отключена</b></div>
      </div>
      {error && <div className="jm-error">{error}</div>}
      <div className="jm-layout">
        <section className="jm-list-panel">
          <div className="jm-list-head"><div><small>JOB QUEUE</small><h2>Все задания <span>{total}</span></h2></div></div>
          <label className="jm-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по ID, файлу или операции"/></label>
          {loading ? <div className="jm-empty">Загружаем историю…</div> :
            filtered.length === 0 ? <div className="jm-empty">{items.length ? 'По запросу ничего не найдено.' : 'Заданий пока нет. Создайте первое задание в рабочем пространстве.'}</div> :
            <div className="jm-items">{filtered.map(item => (
              <button className={'jm-item ' + (selectedId === item.job_id ? 'active' : '')} key={item.job_id} onClick={() => setSelectedId(item.job_id)}>
                <div className="jm-item-top"><b>{item.job_id}</b><span className={'jm-status status-' + item.status.toLowerCase()}>{statusLabel(item.status)}</span></div>
                <div className="jm-file"><ImageIcon size={15}/><span>{item.source.original_name}</span></div>
                <div className="jm-item-ops">{item.operations.map(operation => <span key={operation}>{operation}</span>)}</div>
                <div className="jm-item-bottom"><span><Clock3 size={12}/>{dateLabel(item.created_at)}</span><span>{item.references_count} реф.</span></div>
              </button>
            ))}</div>
          }
        </section>
        <section className="jm-detail-panel">
          {!selectedId ? <div className="jm-empty jm-detail-empty"><FileText size={30}/><b>Выберите задание</b><span>Подробности и исходные материалы появятся здесь.</span></div> :
            detailLoading || !detail ? <div className="jm-empty jm-detail-empty">Загружаем карточку задания…</div> : <>
              <div className="jm-detail-head"><div><small>JOB DETAILS</small><h2>{detail.job_id}</h2><span>{dateLabel(detail.created_at)}</span></div><button className="jm-download" onClick={downloadManifest}><FileJson size={15}/> Скачать JSON</button></div>
              <div className="jm-preview">{detail.source.content_type.startsWith('image/') ? <img src={fileUrl(detail.source)} alt={detail.source.original_name}/> : <div className="jm-file-placeholder"><FileText size={34}/>{detail.source.original_name}</div>}</div>
              <div className="jm-source-meta"><b>{detail.source.original_name}</b><span>{(detail.source.size_bytes / 1048576).toFixed(2)} МБ · {detail.source.content_type}</span></div>
              <div className="jm-section"><h3>Параметры обработки</h3><div className="jm-kv"><span>Статус</span><b>{statusLabel(detail.status)}</b></div><div className="jm-kv"><span>AI-провайдер</span><b>{providerLabel(detail.provider)}</b></div><div className="jm-kv"><span>Режим промпта</span><b>{detail.prompt_mode}</b></div><div className="jm-chips">{detail.operations.map(value => <span key={value}>{value}</span>)}</div></div>
              <div className="jm-section"><h3>Техническое задание</h3><pre className="jm-prompt">{detail.prompt_original}</pre></div>
              <div className="jm-section"><h3><ShieldCheck size={15}/> Защищённые элементы</h3><div className="jm-protected">{detail.protected_elements.map(value => <span key={value}>{value}</span>)}</div></div>
              <div className="jm-section"><h3>Референсы <span className="jm-muted">({detail.references.length})</span></h3>
                {detail.references.length === 0 ? <div className="jm-no-refs">Дополнительные материалы не загружались.</div> :
                  <div className="jm-references">{detail.references.map(file => <a className="jm-reference" href={fileUrl(file)} target="_blank" rel="noreferrer" key={file.stored_name}>
                    {file.content_type.startsWith('image/') ? <img src={fileUrl(file)} alt={file.original_name}/> : <FileText size={25}/>}<span>{file.original_name}</span><ExternalLink size={12}/>
                  </a>)}</div>}
              </div>
              <div className="jm-execution"><div><b>Вызов AI-провайдера</b><span>{detail.execution.provider_called ? 'Выполнен' : 'Не выполнялся'}</span></div><div><b>Проверка QC</b><span>{detail.execution.qc_passed ? 'Пройдена' : 'Не выполнялась'}</span></div><div><b>Согласование человеком</b><span>{detail.execution.human_approval_required ? 'Обязательно' : 'Не требуется'}</span></div><div><b>Публикация</b><span>{detail.execution.publication_eligible ? 'Разрешена' : 'Заблокирована'}</span></div></div>
              <div className="jm-notice">История работает в режиме READ ONLY. Повторный запуск, изменение статуса и публикация пока отключены — они появятся после подключения безопасного контура обработки.</div>
            </>}
        </section>
      </div>
    </section>
  );
}
