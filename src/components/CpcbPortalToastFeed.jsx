import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, MessageCircle, X, XCircle } from 'lucide-react';

function iconFor(type) {
  if (type === 'error') return XCircle;
  if (type === 'warning') return AlertTriangle;
  if (type === 'success') return CheckCircle2;
  return Info;
}

function bubbleStyle(type) {
  if (type === 'error') return 'bg-red-50 border-red-100 text-red-800';
  if (type === 'warning') return 'bg-amber-50 border-amber-100 text-amber-800';
  if (type === 'success') return 'bg-emerald-50 border-emerald-100 text-emerald-800';
  return 'bg-slate-50 border-slate-200 text-slate-800';
}

function iconColor(type) {
  if (type === 'error') return 'text-red-500';
  if (type === 'warning') return 'text-amber-500';
  if (type === 'success') return 'text-emerald-500';
  return 'text-blue-500';
}

function timeLabel(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function CpcbPortalToastFeed({ items = [] }) {
  const [open, setOpen] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const bottomRef = useRef(null);

  const unread = Math.max(0, items.length - seenCount);

  useEffect(() => {
    if (open) setSeenCount(items.length);
  }, [open, items.length]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, items.length]);

  if (!items.length) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open CPCB portal live messages"
        className="fixed bottom-5 right-5 z-[110] flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 hover:scale-105 transition-all"
      >
        <MessageCircle size={24} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[110] flex w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 bg-emerald-600 px-4 py-3 text-white">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">CPCB portal live</p>
          <p className="text-[11px] text-emerald-100 leading-tight">
            {items.length} message{items.length === 1 ? '' : 's'} from the portal
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close CPCB portal live messages"
          className="ml-auto rounded-lg p-1 text-emerald-50 hover:bg-emerald-700"
        >
          <X size={16} />
        </button>
      </div>

      <div className="max-h-[45vh] space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-3">
        {items.slice(-40).map((item) => {
          const Icon = iconFor(item.type);
          return (
            <div key={item.id} className="flex items-end gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white">
                <Icon size={14} className={iconColor(item.type)} />
              </span>
              <div className="min-w-0">
                <div
                  className={`rounded-2xl rounded-bl-sm border px-3 py-2 text-xs leading-snug whitespace-pre-line ${bubbleStyle(item.type)}`}
                >
                  {item.text}
                </div>
                <p className="mt-1 pl-1 text-[10px] text-slate-400">{timeLabel(item.t)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
