'use client';

import { useState } from 'react';
import { Modal, Input, Button, Select } from '@/components/ui';
import { apiPost } from '@/lib/utils/api-mutation';

interface Props {
  open: boolean;
  onClose: () => void;
  reportType: string;
  dateFrom?: string;
  dateTo?: string;
  onSuccess?: () => void;
}

export function ShareReportModal({ open, onClose, reportType, dateFrom, dateTo }: Props) {
  const [emails, setEmails] = useState('');
  const [format, setFormat] = useState('print');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailList = emails.split('\n').map(s => s.trim()).filter(Boolean);
    await apiPost('/api/admin/reports/share', {
      type: reportType,
      format,
      emails: emailList,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      message: message || undefined,
    }, {
      successMsg: '✅ تمت مشاركة التقرير',
      errorMsg: 'فشل مشاركة التقرير',
      onSuccess: () => {
        setEmails('');
        setFormat('print');
        setMessage('');
        onClose();
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="📧 مشاركة التقرير">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="البريد الإلكتروني (بريد واحد لكل سطر)" value={emails} onChange={e => setEmails(e.target.value)} required placeholder="user@example.com" />
        <Select label="صيغة التقرير" value={format} onChange={e => setFormat(e.target.value)} options={[
          { value: 'print', label: 'HTML للطباعة' },
          { value: 'json', label: 'JSON' },
          { value: 'csv', label: 'CSV' },
        ]} />
        <Input label="رسالة (اختياري)" value={message} onChange={e => setMessage(e.target.value)} placeholder="رسالة إضافية..." />
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit">إرسال</Button>
        </div>
      </form>
    </Modal>
  );
}
