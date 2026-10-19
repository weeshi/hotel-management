'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiGet } from '@/lib/utils/api-client';

interface VCCRevealProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  revealUrl?: string;
  vccToken?: string;
  vccExpiryToken?: string;
  vccCVVToken?: string;
  vccHolderName?: string;
  vgsVaultId?: string;
}

const INITIAL_TIMER = 60; // 60 seconds

export function VCCReveal({
  isOpen,
  onClose,
  bookingId,
  revealUrl,
  vccToken,
  vccExpiryToken,
  vccCVVToken,
  vccHolderName,
  vgsVaultId,
}: VCCRevealProps) {
  const [timer, setTimer] = useState(INITIAL_TIMER);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealData, setRevealData] = useState<{
    revealUrl: string;
    vccToken: string;
    vccHolderName: string;
  } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-close and cleanup
  const closeModal = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimer(INITIAL_TIMER);
    setRevealData(null);
    setError(null);
    onClose();
  }, [onClose]);

  // Fetch VCC tokens when modal opens
  const fetchVCCTokens = useCallback(async () => {
    if (!bookingId) return;

    setIsLoading(true);
    setError(null);

try {
        const response = await apiGet<{
          vccToken: string;
          vccExpiryToken: string;
          vccCVVToken: string;
          vccHolderName: string;
          vgsVaultId: string;
          revealUrl: string;
        }>(`/api/admin/bookings/${bookingId}/vcc-tokens`);

        if (response.success && response.data) {
          setRevealData({
            revealUrl: response.data.revealUrl,
            vccToken: response.data.vccToken,
            vccHolderName: response.data.vccHolderName,
          });
        } else if (!response.success) {
          throw new Error(response.error?.message || 'فشل جلب بيانات البطاقة');
        } else {
          throw new Error('فشل جلب بيانات البطاقة');
        }
      } catch (err: any) {
        setError(err.message || 'فشل جلب بيانات البطاقة الافتراضية');
      } finally {
        setIsLoading(false);
      }
  }, [bookingId]);

  // Timer countdown
  useEffect(() => {
    if (isOpen && timer > 0) {
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            closeModal();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, timer, closeModal]);

  // Fetch tokens when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchVCCTokens();
    } else {
      closeModal();
    }
  }, [isOpen, fetchVCCTokens, closeModal]);

  // Handle iframe load
  const handleIframeLoad = () => {
    // Iframe loaded successfully
    console.log('[VCCReveal] VGS Reveal iframe loaded');
  };

  // Handle iframe error
  const handleIframeError = () => {
    setError('فشل تحميل بيانات البطاقة. يرجى المحاولة مرة أخرى.');
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="vcc-reveal-title">
      {/* Backdrop click to close */}
      <div
        className="absolute inset-0"
        onClick={closeModal}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <h2 id="vcc-reveal-title" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            بيانات البطاقة الافتراضية (VCC)
          </h2>
          <button
            onClick={closeModal}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="إغلاق"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Timer Bar */}
        <div className="h-2 bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={timer} aria-valuemin={0} aria-valuemax={INITIAL_TIMER} aria-label="وقت المتبقي">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 transition-all duration-1000 ease-linear"
            style={{ width: `${(timer / INITIAL_TIMER) * 100}%` }}
          />
        </div>
        <div className="px-4 py-2 text-right text-sm text-gray-500">
          يغلق تلقائياً خلال <span className="font-mono font-bold text-amber-600">{timer}</span> ثانية
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Warning Message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-red-800">
                <p className="font-medium">⚠️ تنبيه أمني هام</p>
                <p className="mt-1">بيانات البطاقة الافتراضية (VCC) حساسة جداً. يرجى إدخالها يدوياً في جهاز الـ <strong>POS</strong> الخاص بالفندق <strong>الآن</strong>.</p>
                <p className="mt-1">ستختفي هذه النافذة <strong>أوتوماتيكياً</strong> لأسباب أمنية بعد <span className="font-mono font-bold">60 ثانية</span>.</p>
                <p className="mt-1 text-xs">لا تقم بتصوير الشاشة أو حفظ البيانات بأي شكل.</p>
              </div>
            </div>
          </div>

          {/* VCC Info Card */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              بيانات البطاقة للنسخ
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">اسم حامل البطاقة</label>
                <div className="font-mono text-gray-900 bg-white px-2 py-1 rounded border">{revealData?.vccHolderName || vccHolderName || '—'}</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vault ID</label>
                <div className="font-mono text-gray-900 bg-white px-2 py-1 rounded border truncate">{vgsVaultId || '—'}</div>
              </div>
            </div>
          </div>

          {/* VGS Reveal Iframe */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <p className="text-xs text-gray-600 font-medium">عرض البطاقة الآمن (VGS Reveal)</p>
            </div>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <svg className="animate-spin h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-sm">جاري جلب بيانات البطاقة الآمنة...</p>
                </div>
              </div>
            ) : error ? (
              <div className="h-64 flex items-center justify-center bg-red-50 p-4">
                <div className="text-center text-red-600">
                  <svg className="w-10 h-10 mx-auto mb-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm">{error}</p>
                  <button
                    onClick={fetchVCCTokens}
                    className="mt-2 px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
                    disabled={isLoading}
                  >
                    إعادة المحاولة
                  </button>
                </div>
              </div>
            ) : revealData ? (
              <iframe
                ref={iframeRef}
                src={revealData.revealUrl}
                className="w-full h-64 border-0"
                title="VGS Reveal - Virtual Credit Card Data"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                sandbox="allow-scripts allow-same-origin allow-forms"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-64 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
                لا توجد بيانات للعرض
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={() => navigator.clipboard.writeText(revealData?.vccToken || vccToken || '')}
              disabled={!revealData?.vccToken && !vccToken}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2h-2M8 5a2 2 0 00-2 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2z" />
              </svg>
              نسخ التوكن
            </button>
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-red-600 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              إغلاق الآن
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Helper for iframe load/error handlers (defined outside to avoid recreation)
function handleIframeLoad() {
  console.log('[VCCReveal] VGS Reveal iframe loaded successfully');
}

function handleIframeError() {
  // Error handled by parent component state
  console.error('[VCCReveal] Failed to load VGS Reveal iframe');
}