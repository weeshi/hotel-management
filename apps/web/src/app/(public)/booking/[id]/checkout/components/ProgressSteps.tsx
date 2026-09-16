'use client';

interface ProgressStepsProps {
  currentStep: 'select-gateway' | 'redirecting' | 'bank-transfer' | 'cash' | 'success' | 'failed';
}

const steps: { key: ProgressStepsProps['currentStep']; label: string; icon: React.ReactNode }[] = [
  { key: 'select-gateway', label: 'اختيار الطريقة', icon: <CreditCardIcon /> },
  { key: 'redirecting', label: 'التوجيه للبوابة', icon: <ArrowRightIcon /> },
  { key: 'bank-transfer', label: 'تحويل بنكي', icon: <BankIcon /> },
  { key: 'cash', label: 'دفع نقدي', icon: <CashIcon /> },
  { key: 'success', label: 'نجح الدفع', icon: <CheckIcon /> },
  { key: 'failed', label: 'فشل الدفع', icon: <XIcon /> },
];

const stepOrder = ['select-gateway', 'redirecting', 'bank-transfer', 'cash', 'success', 'failed'];

function CreditCardIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function ArrowRightIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function BankIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function CashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function ProgressSteps({ currentStep }: ProgressStepsProps) {
  const currentIndex = stepOrder.indexOf(currentStep);

  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <div className="flex items-center min-w-max">
        {steps.map((step, index) => {
          const isActive = index <= currentIndex && stepOrder[index] !== 'failed';
          const isCurrent = index === currentIndex;
          const isCompleted = index < currentIndex && stepOrder[index] !== 'failed';

          // Skip bank-transfer/cash in progress if not current step
          if ((step.key === 'bank-transfer' || step.key === 'cash') && step.key !== currentStep) {
            return null;
          }

          return (
            <div key={step.key} className="flex items-center">
              <div className="relative flex flex-col items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                    isActive
                      ? 'border-[var(--gold)] bg-[var(--gold)] text-white'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]'
                  }`}
                >
                  {isCompleted && stepOrder[index] !== 'select-gateway' ? (
                    <CheckIcon className="h-5 w-5" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium whitespace-nowrap ${
                    isActive ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-1 transition-colors ${
                    isCompleted ? 'bg-[var(--gold)]' : 'bg-[var(--border)]'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}