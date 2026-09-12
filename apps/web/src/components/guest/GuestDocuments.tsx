'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, Button, Select } from '@/components/ui';
import { showErrorModal } from '@/components/ui/error-modal';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface GuestDocumentItem {
  id: string;
  documentType: string;
  fileName: string;
  fileMimeType: string;
  uploadedAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

interface Props {
  guestId: string;
}

const TYPE_LABELS: Record<string, string> = {
  PASSPORT: 'جواز سفر',
  NATIONAL_ID: 'بطاقة هوية',
};

export function GuestDocuments({ guestId }: Props) {
  const [documents, setDocuments] = useState<GuestDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentType, setDocumentType] = useState('PASSPORT');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchDocuments() {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/admin/guests/${guestId}/documents`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) setDocuments(data.data || []);
    } catch {
      // silently ignore list errors
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDocuments(); }, [guestId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      showErrorModal('اختر ملفاً أولاً');
      return;
    }
    setUploading(true);
    try {
      await getCsrfToken();
      const form = new FormData();
      form.append('file', file);
      form.append('documentType', documentType);

      const res = await fetch(`/api/admin/guests/${guestId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          ...csrfHeaders(),
        },
        body: form,
      });
      const data = await res.json();
      if (data.success) {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchDocuments();
      } else {
        showErrorModal(data.error?.message || data.error || 'فشل رفع الوثيقة');
      }
    } catch {
      showErrorModal('فشل الاتصال');
    } finally {
      setUploading(false);
    }
  }

  async function viewDocument(doc: GuestDocumentItem) {
    setViewingId(doc.id);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/admin/documents/${doc.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showErrorModal(err.error?.message || err.error || 'فشل فتح الوثيقة');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showErrorModal('فشل الاتصال');
    } finally {
      setViewingId(null);
    }
  }

  return (
    <div data-component="GuestDocuments">
      <Card title="🛂 وثائق النزيل">
        <div className="space-y-5">
        {/* --- Upload Form --- */}
        <form onSubmit={handleUpload} className="space-y-3 border border-[var(--border)] rounded-xl p-4 bg-[var(--bg-primary)]">
          <div className="grid md:grid-cols-2 gap-3">
            <Select
              label="نوع الوثيقة"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              options={[
                { value: 'PASSPORT', label: 'جواز سفر' },
                { value: 'NATIONAL_ID', label: 'بطاقة هوية' },
              ]}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--text-secondary)]">الملف</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-[var(--gold)] file:text-black file:px-4 file:py-2 file:text-xs file:font-bold hover:file:brightness-110"
              />
              <p className="text-[10px] text-[var(--text-muted)]">JPG أو PNG أو PDF — بحد أقصى 5MB</p>
            </div>
          </div>
          <Button type="submit" loading={uploading} disabled={!file}>
            {uploading ? 'جاري الرفع...' : '📤 رفع الوثيقة'}
          </Button>
        </form>

        {/* --- Documents List --- */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin h-6 w-6 text-[var(--gold)]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-6">لا توجد وثائق مرفوعة لهذا النزيل</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{TYPE_LABELS[doc.documentType] || doc.documentType}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-muted)] uppercase">
                      {doc.fileMimeType.split('/')[1] || doc.fileMimeType}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5" title={doc.fileName}>{doc.fileName}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {new Date(doc.uploadedAt).toLocaleString('ar-LY')}
                    {doc.uploadedBy?.name ? ` — بواسطة ${doc.uploadedBy.name}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="secondary" loading={viewingId === doc.id} onClick={() => viewDocument(doc)}>
                  👁️ عرض
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </Card>
    </div>
  );
}
