import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Mail, MessageCircle, HelpCircle, Shield, AlertTriangle } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';

const Support = () => {
    const navigate = useNavigate();
    const { playSound } = useSound();

    return (
        <div className="min-h-[100dvh] bg-gray-950 text-white relative overflow-x-hidden overflow-y-auto flex flex-col items-center p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-12">
            <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-emerald-600/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-blue-600/10 rounded-full blur-3xl animate-pulse" />

            <header className="w-full max-w-2xl flex items-center justify-between mb-6 z-10">
                <button
                    onClick={() => { playSound('click'); navigate(-1); }}
                    className="p-3 bg-white/10 rounded-full backdrop-blur-md active:scale-90 transition-transform"
                >
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-xl font-bold">Support / 고객지원</h1>
                <div className="w-12" />
            </header>

            <main className="w-full max-w-2xl z-10 space-y-6 text-sm leading-relaxed text-gray-200">

                {/* Contact Section */}
                <section className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Mail size={20} className="text-emerald-400" />
                        <h2 className="text-base font-semibold text-white">Contact Us / 문의하기</h2>
                    </div>
                    <p>If you have any questions, issues, or feedback, please contact us via email.</p>
                    <p>질문, 문제, 또는 피드백이 있으신 경우 아래 이메일로 연락해 주세요.</p>
                    <a
                        href="mailto:kilssengkyu@gmail.com"
                        className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-white transition-colors active:scale-95"
                    >
                        <Mail size={16} />
                        kilssengkyu@gmail.com
                    </a>
                    <p className="text-gray-400 text-xs mt-2">We typically respond within 48 hours. / 보통 48시간 이내에 답변 드립니다.</p>
                </section>

                {/* FAQ Section */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                        <HelpCircle size={20} className="text-blue-400" />
                        <h2 className="text-base font-semibold text-white">FAQ / 자주 묻는 질문</h2>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 space-y-2">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={16} className="text-emerald-400 shrink-0" />
                            <p className="font-semibold text-white">How do I play?</p>
                        </div>
                        <p className="pl-6 text-gray-300">
                            Match with an opponent and compete in various brain-training mini-games in real time!
                            상대방과 매치되어 다양한 두뇌 미니게임에서 실시간으로 대결하세요!
                        </p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 space-y-2">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={16} className="text-emerald-400 shrink-0" />
                            <p className="font-semibold text-white">How do I delete my account?</p>
                        </div>
                        <p className="pl-6 text-gray-300">
                            Go to Settings → Delete Account. All your data will be permanently removed.
                            설정 → 계정 삭제에서 가능합니다. 모든 데이터가 영구적으로 삭제됩니다.
                        </p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 space-y-2">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={16} className="text-emerald-400 shrink-0" />
                            <p className="font-semibold text-white">I made a purchase but didn't receive the item.</p>
                        </div>
                        <p className="pl-6 text-gray-300">
                            Try restoring purchases in Settings → Restore Purchases. If the issue persists, contact us via email above.
                            설정 → 구매 복원을 시도해 주세요. 문제가 지속되면 위 이메일로 문의해 주세요.
                        </p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 space-y-2">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={16} className="text-emerald-400 shrink-0" />
                            <p className="font-semibold text-white">The game is lagging or not loading.</p>
                        </div>
                        <p className="pl-6 text-gray-300">
                            Please check your internet connection and try restarting the app. If the problem continues, contact us.
                            인터넷 연결을 확인하고 앱을 재시작해 보세요. 문제가 계속되면 문의해 주세요.
                        </p>
                    </div>
                </section>

                {/* Report Section */}
                <section className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={20} className="text-amber-400" />
                        <h2 className="text-base font-semibold text-white">Report a Problem / 문제 신고</h2>
                    </div>
                    <p>To report bugs, inappropriate content, or other issues, please email us with details about the problem.</p>
                    <p>버그, 부적절한 콘텐츠, 또는 기타 문제를 신고하려면 문제에 대한 자세한 내용과 함께 이메일을 보내주세요.</p>
                </section>

                {/* Privacy Link */}
                <section className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield size={20} className="text-purple-400" />
                        <h2 className="text-base font-semibold text-white">Privacy Policy / 개인정보 처리방침</h2>
                    </div>
                    <p>
                        Learn how we handle your data. /
                        개인정보 처리에 대해 알아보세요.
                    </p>
                    <button
                        onClick={() => { playSound('click'); navigate('/privacy'); }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-semibold text-white transition-colors active:scale-95"
                    >
                        View Privacy Policy
                    </button>
                </section>

                <footer className="text-center text-gray-500 text-xs pt-4">
                    <p>BrainRush by SK.GIL</p>
                    <p>© 2026 All rights reserved.</p>
                </footer>
            </main>
        </div>
    );
};

export default Support;
