import React, { useState } from 'react';
import { X, Send, Loader2, ArrowUpRight, AlertCircle } from 'lucide-react';
import { apiFetch, formatEventDate } from '../lib/api';
import type { CampusEvent } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citedEvents?: CampusEvent[];
  error?: boolean;
}

interface CampusAssistantModalProps {
  open: boolean;
  onClose: () => void;
  onOpenEvent: (eventId: string) => void;
}

const SAMPLE_PROMPTS = [
  'What events are happening today?',
  'Which hackathons or tech talks are open?',
  'What events match my interests?',
  'Which events have deadlines closing soon?',
];

export function CampusAssistantModal({ open, onClose, onOpenEvent }: CampusAssistantModalProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Ask me about upcoming campus events, registration deadlines, remaining seats, venues, or recommendations based on your interests.',
    },
  ]);

  if (!open) return null;

  const submitQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiFetch<{ answer: string; citedEvents: CampusEvent[] }>('/api/ai/assistant', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed }),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: res.answer,
          citedEvents: res.citedEvents,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: 'assistant',
          text: err?.message || 'Unable to reach the Campus Assistant right now. Please try again.',
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(input);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campus-ai-title"
    >
      <div className="flex flex-col w-full max-w-lg bg-white h-full border-l border-slate-200 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="campus-ai-title" className="font-display text-base font-semibold text-slate-900">
              Campus Event Assistant
            </h2>
            <p className="text-xs text-slate-500">Answers grounded strictly in live published campus listings</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label="Close Campus Assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {messages.length <= 1 && (
            <div className="space-y-2 pb-2">
              <p className="text-xs font-medium text-slate-500">Suggested questions</p>
              <div className="grid grid-cols-1 gap-2">
                {SAMPLE_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => submitQuestion(q)}
                    className="text-left text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3.5 py-2.5 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : msg.error
                    ? 'bg-red-50 border border-red-200 text-red-800'
                    : 'bg-slate-100 text-slate-800'
                }`}
              >
                {msg.error && <AlertCircle className="w-4 h-4 inline mr-1.5 -mt-0.5" />}
                {msg.text}
              </div>

              {msg.citedEvents && msg.citedEvents.length > 0 && (
                <div className="mt-2 w-full space-y-1.5">
                  {msg.citedEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenEvent(ev.id);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{ev.title}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {formatEventDate(ev.event_date)} · {ev.start_time} · {ev.venue}
                        </p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-blue-700 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Checking live campus schedule...</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <label htmlFor="campus-ai-input" className="sr-only">
              Ask about campus events
            </label>
            <input
              id="campus-ai-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about events today, deadlines, workshops..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              maxLength={400}
            />
            <button
              type="submit"
              disabled={loading || input.trim().length < 2}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Send question"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
