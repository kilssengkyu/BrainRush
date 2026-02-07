import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';

const Privacy = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { playSound } = useSound();

    return (
        <div className="min-h-[100dvh] bg-gray-950 text-white relative overflow-x-hidden overflow-y-auto flex flex-col items-center p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
            <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-emerald-600/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-blue-600/10 rounded-full blur-3xl animate-pulse" />

            <header className="w-full max-w-2xl flex items-center justify-between mb-6 z-10">
                <button
                    onClick={() => { playSound('click'); navigate(-1); }}
                    className="p-3 bg-white/10 rounded-full backdrop-blur-md active:scale-90 transition-transform"
                >
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-xl font-bold">{t('privacy.title', '개인정보 처리방침')}</h1>
                <div className="w-12" />
            </header>

            <main className="w-full max-w-2xl z-10 space-y-6 text-sm leading-relaxed text-gray-200">
                <p className="text-gray-400">{t('privacy.updated', '최종 업데이트')}: 2026-02-07</p>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">1. 개요</h2>
                    <p>SK.GIL(이하 “운영자”)는 BrainRush 서비스 제공을 위해 필요한 최소한의 개인정보를 수집·이용합니다.</p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">2. 수집하는 정보</h2>
                    <p className="font-semibold text-white">필수</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                        <li>계정 정보: 이메일 또는 OAuth 식별자, 사용자 ID</li>
                        <li>프로필 정보: 닉네임, 아바타, 국가 코드</li>
                        <li>서비스 이용 정보: 게임 기록, 랭크/점수, 매치 기록</li>
                    </ul>
                    <p className="font-semibold text-white mt-2">자동 수집</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                        <li>로그 및 기기 정보(오류 로그, 성능 정보 등)</li>
                    </ul>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">3. 이용 목적</h2>
                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                        <li>계정 생성 및 로그인 처리</li>
                        <li>게임 진행, 랭킹/매치 기록 저장</li>
                        <li>고객 지원 및 문의 대응</li>
                        <li>결제 및 구매 복원 처리</li>
                    </ul>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">4. 제3자 제공 및 처리 위탁</h2>
                    <p>서비스 운영을 위해 다음과 같은 제3자 서비스를 사용할 수 있습니다.</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                        <li>인증/DB: Supabase</li>
                        <li>결제: Apple App Store / Google Play</li>
                        <li>광고: Google AdMob</li>
                        <li>호스팅: Vercel</li>
                    </ul>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">5. 보유 및 이용 기간</h2>
                    <p>회원 탈퇴 또는 목적 달성 시 지체 없이 삭제합니다. 단, 관련 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관합니다.</p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">6. 이용자 권리</h2>
                    <p>이용자는 언제든지 개인정보 열람·정정·삭제를 요청할 수 있습니다.</p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">7. 보안</h2>
                    <p>전송 구간 암호화(HTTPS) 등 합리적인 보호 조치를 적용합니다.</p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">8. 아동의 개인정보</h2>
                    <p>본 서비스는 만 13세 미만 아동을 주요 대상으로 하지 않습니다.</p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">9. 변경 사항</h2>
                    <p>정책 변경 시 본 페이지에 공지하며, 중요한 변경은 앱 내 공지로 안내합니다.</p>
                </section>

                <section className="space-y-2">
                    <h2 className="text-base font-semibold text-white">10. 문의처</h2>
                    <p>이메일: kilssengkyu@naver.com</p>
                    <p>운영자: SK.GIL</p>
                </section>
            </main>
        </div>
    );
};

export default Privacy;
