import React, { useEffect, useState } from 'react';
import { X, Loader2, Upload, Eye, Edit3, Wand2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useToast } from '../lib/toast-context';
import { EventImage } from './EventImage';
import type { CampusEvent, Category } from '../types';

interface EventComposerModalProps {
  open: boolean;
  categories: Category[];
  editingEvent: CampusEvent | null;
  onClose: () => void;
  onSaved: (event: CampusEvent) => void;
}

const COVER_PRESETS = [
  { label: 'Hackathon Studio', url: '/covers/hackathon.svg' },
  { label: 'Engineering Lab', url: '/covers/workshop.svg' },
  { label: 'Amphitheatre Stage', url: '/covers/cultural.svg' },
  { label: 'Fieldhouse Arena', url: '/covers/sports.svg' },
  { label: 'Library Commons', url: '/covers/meetup.svg' },
];

function defaultDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function EventComposerModal({
  open,
  categories,
  editingEvent,
  onClose,
  onSaved,
}: EventComposerModalProps) {
  const { showToast } = useToast();

  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [roughNotes, setRoughNotes] = useState('');
  const [description, setDescription] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [eventDate, setEventDate] = useState(defaultDateOffset(3));
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('19:00');
  const [registrationDeadline, setRegistrationDeadline] = useState(`${defaultDateOffset(2)}T23:59`);
  const [venue, setVenue] = useState('');
  const [capacity, setCapacity] = useState('60');
  const [imageUrl, setImageUrl] = useState('/covers/meetup.svg');

  const [submitting, setSubmitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggestingCat, setAiSuggestingCat] = useState(false);
  const [aiCategoryReason, setAiCategoryReason] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab('edit');
    setFormError('');
    setAiCategoryReason('');

    if (editingEvent) {
      setTitle(editingEvent.title);
      setCategoryId(editingEvent.category_id);
      setDescription(editingEvent.description);
      setAdditionalInstructions(editingEvent.additional_instructions);
      setEventDate(editingEvent.event_date);
      setStartTime(editingEvent.start_time);
      setEndTime(editingEvent.end_time);
      setRegistrationDeadline(editingEvent.registration_deadline);
      setVenue(editingEvent.venue);
      setCapacity(String(editingEvent.capacity));
      setImageUrl(editingEvent.image_url || '/covers/meetup.svg');
      setRoughNotes('');
    } else {
      setTitle('');
      setCategoryId(categories[0]?.id || '');
      setDescription('');
      setAdditionalInstructions('');
      setEventDate(defaultDateOffset(3));
      setStartTime('17:00');
      setEndTime('19:00');
      setRegistrationDeadline(`${defaultDateOffset(2)}T23:59`);
      setVenue('');
      setCapacity('60');
      setImageUrl('/covers/meetup.svg');
      setRoughNotes('');
    }
  }, [open, editingEvent, categories]);

  if (!open) return null;

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const handleGenerateDescription = async () => {
    if (title.trim().length < 3) {
      setFormError('Enter an event title first so AI can draft a description.');
      return;
    }
    setFormError('');
    setAiGenerating(true);
    try {
      const res = await apiFetch<{ description: string; additionalInstructions: string }>(
        '/api/ai/generate-description',
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            categoryName: selectedCategory?.name || '',
            venue,
            eventDate,
            startTime,
            endTime,
            roughNotes: roughNotes || description,
          }),
        }
      );
      if (res.description) setDescription(res.description);
      if (res.additionalInstructions && !additionalInstructions) {
        setAdditionalInstructions(res.additionalInstructions);
      }
      showToast('AI draft generated. Review and edit before publishing.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not generate description.', 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSuggestCategory = async () => {
    if (!title.trim() && !roughNotes.trim() && !description.trim()) {
      setFormError('Enter a title or notes first so AI can suggest a category.');
      return;
    }
    setFormError('');
    setAiSuggestingCat(true);
    try {
      const res = await apiFetch<{ categoryId: string; categoryName: string; reason: string }>(
        '/api/ai/suggest-category',
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            description: `${roughNotes}\n${description}`.trim(),
          }),
        }
      );
      setCategoryId(res.categoryId);
      setAiCategoryReason(`${res.categoryName}: ${res.reason}`);
      showToast(`Suggested category: ${res.categoryName}`, 'info');
    } catch (err: any) {
      showToast(err?.message || 'Could not suggest category.', 'error');
    } finally {
      setAiSuggestingCat(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setFormError('Only PNG, JPEG, or WEBP images are supported.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormError('Image must be smaller than 2 MB.');
      return;
    }

    setUploadingImage(true);
    setFormError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ url: string }>('/api/uploads/image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      setImageUrl(res.url);
      showToast('Event banner uploaded.', 'success');
    } catch (err: any) {
      setFormError(err?.message || 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const submitEvent = async (targetStatus: 'draft' | 'published') => {
    setFormError('');
    if (title.trim().length < 4) {
      setFormError('Event title must be at least 4 characters.');
      return;
    }
    if (description.trim().length < 20) {
      setFormError('Description must be at least 20 characters (or use AI Draft).');
      return;
    }
    if (!venue.trim()) {
      setFormError('Please enter the campus venue.');
      return;
    }
    if (endTime <= startTime) {
      setFormError('End time must be after start time.');
      return;
    }
    const capNum = Number(capacity);
    if (!Number.isInteger(capNum) || capNum < 1 || capNum > 5000) {
      setFormError('Capacity must be a whole number between 1 and 5000.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        category_id: categoryId,
        description: description.trim(),
        additional_instructions: additionalInstructions.trim(),
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        registration_deadline: registrationDeadline,
        venue: venue.trim(),
        capacity: capNum,
        image_url: imageUrl,
        status: targetStatus,
      };

      const res = editingEvent
        ? await apiFetch<{ event: CampusEvent }>(`/api/events/${editingEvent.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ event: CampusEvent }>('/api/events', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      showToast(
        targetStatus === 'published'
          ? editingEvent
            ? 'Event updated and live.'
            : 'Event published to campus feed.'
          : 'Event saved as draft.',
        'success'
      );
      onSaved(res.event);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save event.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <h2 id="composer-title" className="font-display text-lg font-semibold text-slate-900">
              {editingEvent ? 'Edit Event' : 'Publish Campus Event'}
            </h2>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setTab('edit')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  tab === 'edit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Details</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('preview')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  tab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {formError && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {formError}
            </div>
          )}

          {tab === 'preview' ? (
            <div className="space-y-6">
              <div className="aspect-[16/9] w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <EventImage src={imageUrl} alt={title || 'Event preview'} categoryName={selectedCategory?.name} className="w-full h-full" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-2">
                  <span className="font-medium text-slate-700">{selectedCategory?.name || 'Category'}</span>
                  {' · '}
                  <span>{eventDate}</span>
                  {' · '}
                  <span className="font-mono tabular-nums">{startTime} – {endTime}</span>
                  {' · '}
                  <span>{venue || 'Campus Venue'}</span>
                </div>
                <h3 className="font-display text-2xl font-bold text-slate-900 mb-3">
                  {title || 'Untitled Campus Event'}
                </h3>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                  {description || 'Your event description will appear here.'}
                </p>
                {additionalInstructions && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-xs font-semibold text-slate-900 mb-1">Attendee Instructions</p>
                    <p className="text-sm text-slate-600">{additionalInstructions}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="evt-title" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Event Title *
                  </label>
                  <input
                    id="evt-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Robotics Hardware Sprint"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    maxLength={120}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="evt-category" className="block text-xs font-semibold text-slate-700">
                      Category *
                    </label>
                    <button
                      type="button"
                      onClick={handleSuggestCategory}
                      disabled={aiSuggestingCat}
                      className="text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50"
                    >
                      {aiSuggestingCat ? 'Suggesting...' : 'AI Suggest'}
                    </button>
                  </div>
                  <select
                    id="evt-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:border-blue-600 focus:outline-none"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {aiCategoryReason && (
                <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  AI Recommendation: {aiCategoryReason}
                </p>
              )}

              {/* Quick AI notes & generator */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="evt-notes" className="text-xs font-semibold text-slate-800">
                    Quick Notes for AI Description Generator (optional)
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={aiGenerating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    <span>{aiGenerating ? 'Drafting...' : 'Generate Description with AI'}</span>
                  </button>
                </div>
                <input
                  id="evt-notes"
                  type="text"
                  value={roughNotes}
                  onChange={(e) => setRoughNotes(e.target.value)}
                  placeholder="e.g., Beginner-friendly Python clinic, snacks provided, bring laptop, 2-hour hands-on build"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="evt-desc" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Event Description * (editable)
                </label>
                <textarea
                  id="evt-desc"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what students will experience, learn, or build..."
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  maxLength={4000}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="evt-date" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Event Date *
                  </label>
                  <input
                    id="evt-date"
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="evt-start" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Start Time *
                  </label>
                  <input
                    id="evt-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="evt-end" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    End Time *
                  </label>
                  <input
                    id="evt-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label htmlFor="evt-capacity" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Max Capacity *
                  </label>
                  <input
                    id="evt-capacity"
                    type="number"
                    min={1}
                    max={5000}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="evt-deadline" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Registration Deadline *
                  </label>
                  <input
                    id="evt-deadline"
                    type="datetime-local"
                    value={registrationDeadline}
                    onChange={(e) => setRegistrationDeadline(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="evt-venue" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Campus Venue *
                  </label>
                  <input
                    id="evt-venue"
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="e.g., Innovation Hall, Room 204"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    maxLength={140}
                  />
                </div>
                <div>
                  <label htmlFor="evt-instructions" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Additional Instructions
                  </label>
                  <input
                    id="evt-instructions"
                    type="text"
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                    placeholder="e.g., Bring student ID and laptop"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    maxLength={1000}
                  />
                </div>
              </div>

              {/* Cover image picker + real file upload */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">Event Banner Image</span>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                    {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>{uploadingImage ? 'Uploading...' : 'Upload PNG/JPG/WEBP'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {COVER_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setImageUrl(preset.url)}
                      className={`rounded-lg overflow-hidden border-2 text-left transition-all ${
                        imageUrl === preset.url ? 'border-blue-600 ring-2 ring-blue-600/20' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="aspect-[16/9] w-full bg-slate-100">
                        <EventImage src={preset.url} alt={preset.label} className="w-full h-full" />
                      </div>
                      <p className="text-[11px] font-medium text-slate-700 px-1.5 py-1 truncate">{preset.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitEvent('draft')}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitEvent('published')}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{editingEvent ? 'Save & Publish' : 'Publish Event'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
