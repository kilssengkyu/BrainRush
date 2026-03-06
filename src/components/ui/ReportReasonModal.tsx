import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ReportReasonModalProps {
  isOpen: boolean;
  targetName?: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

const MAX_REASON_LENGTH = 300;

const ReportReasonModal = ({ isOpen, targetName, onClose, onSubmit }: ReportReasonModalProps) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const trimmed = useMemo(() => reason.trim(), [reason]);
  const canSubmit = !isSubmitting && trimmed.length >= 3;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-50 dark:bg-gray-900 p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('report.title', '신고')}</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">
          {targetName
            ? t('report.descriptionWithTarget', { target: targetName, defaultValue: `상대(${targetName})를 신고합니다. 사유를 입력해 주세요.` })
            : t('report.description', '신고 사유를 입력해 주세요.')}
        </p>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
          placeholder={t('report.placeholder', '신고 사유를 입력해 주세요.')}
          className="mt-3 h-32 w-full resize-none rounded-xl border border-white/15 bg-black/25 p-3 text-sm text-slate-900 dark:text-white outline-none focus:border-red-400/70"
          maxLength={MAX_REASON_LENGTH}
        />

        <div className="mt-1 text-right text-xs text-slate-500 dark:text-gray-400">{reason.length}/{MAX_REASON_LENGTH}</div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-gray-200 hover:bg-white/5 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={async () => {
              if (!canSubmit) return;
              setIsSubmitting(true);
              try {
                await onSubmit(trimmed);
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isSubmitting ? t('common.loading') : t('report.submit', '신고하기')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportReasonModal;
