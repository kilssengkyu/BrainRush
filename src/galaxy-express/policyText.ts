type PolicyDocument = {
  title: string
  sections: { title: string; paragraphs: string[] }[]
}

export const policyText: Record<'ko' | 'en', Record<'privacy' | 'terms', PolicyDocument>> = {
  ko: {
    privacy: {
      title: '개인정보처리방침',
      sections: [
        {
          title: '운영자와 적용 범위',
          paragraphs: [
            '운영자 길성규는 은하열차 키우기의 게임 서비스와 고객지원 과정에서 개인정보를 처리합니다. 개인정보 문의와 권리 행사 요청은 이 페이지에 안내된 은하열차 키우기 고객지원 이메일로 접수할 수 있습니다.',
          ],
        },
        {
          title: '처리하는 정보와 이용 목적',
          paragraphs: [
            '계정 생성, 로그인, 진행 저장·복구를 위해 게임 계정 식별자, 로그인 연동 상태, 게임 진행·재화·아이템·이벤트 기록을 처리합니다. Google 또는 Apple 로그인을 선택하면 해당 로그인 서비스가 전달하는 연동 식별자와 인증 결과를 처리합니다. 게임은 해당 계정의 비밀번호나 결제 카드번호를 직접 받지 않습니다.',
            '공개 프로필, 채팅, 랭킹을 제공하기 위해 닉네임, 프로필 장식, 채팅 내용·발신자·시각, 랭킹 점수를 처리합니다. 공개 화면에 표시되는 정보는 다른 이용자가 볼 수 있습니다. 최근 채팅은 기기에 임시 저장될 수 있습니다.',
            '정식 구매 기능을 제공하는 경우 상품·거래·영수증 식별 정보와 거래·지급 상태를 구매 확인, 중복 지급 방지, 취소 및 환불 처리에 이용합니다. 연결 유지 및 오류 대응 과정에서 서버와 SDK 설정에 따라 접속 정보, 기기·앱 버전 및 진단 정보가 처리될 수 있습니다.',
            '약관 확인과 알림 설정을 위해 만 14세 이상 확인 결과, 문서 버전, 동의·변경 시각, 선택 설정을 기록합니다. 이메일 문의를 보내면 발신 주소, 문의 내용과 이용자가 첨부한 정보를 요청 확인 및 답변에 이용합니다.',
          ],
        },
        {
          title: '처리 근거와 선택 설정',
          paragraphs: [
            '계정 제공·저장 등에 필요한 정보는 계약 체결·이행을 위해 처리하고, 법정 거래 기록은 해당 법령에 따라 보존합니다. 별도 동의가 필요한 처리는 목적, 정보 항목, 보유기간과 거부에 따른 영향을 안내하고 동의를 받습니다.',
            '광고성 알림 수신과 야간 광고성 알림 수신은 각각 선택 사항이며 선택을 철회해도 기본 게임 이용에 영향이 없습니다. 실제 발송을 제공하는 경우 기기의 알림 권한과 게임에서 선택한 수신 설정을 함께 적용합니다.',
          ],
        },
        {
          title: '보유기간과 파기',
          paragraphs: [
            '계정 및 고객지원 정보는 처리 목적이 달성되거나 계정 삭제가 완료되면 파기합니다. 법령에 따라 보존해야 하는 거래 기록은 해당 목적을 위해 제한하여 보존합니다. 적용되는 경우 계약·청약철회 및 결제·공급 기록은 5년, 소비자 불만·분쟁 처리 기록은 3년, 표시·광고 기록은 6개월 보존합니다.',
            '보존 의무가 끝난 전자 기록은 복구하기 어려운 방식으로 파기합니다. 채팅, 접속·진단 로그 및 백업의 세부 보존기간과 처리 일정은 정식 서비스의 실제 운영 기준에 맞춰 공개합니다.',
          ],
        },
        {
          title: '외부 서비스와 국외 이전',
          paragraphs: [
            '게임 계정, 서버 저장, 랭킹 및 채팅에는 Unity Gaming Services와 Vivox를 사용합니다. 로그인·결제·광고를 이용할 때는 해당 기능에 적용되는 Google, Apple 또는 광고 서비스가 관여할 수 있습니다.',
            '정식 서비스에 적용되는 수탁자, 처리 업무와 보유기간 및 국외 이전이 있는 경우 이전 국가, 수령자, 목적, 근거와 거부 방법 등은 실제 계약과 운영 구성을 확인해 공개합니다.',
          ],
        },
        {
          title: '이용자의 권리',
          paragraphs: [
            '이용자와 법정대리인은 적용 법령에 따라 개인정보 열람·정정·삭제·처리정지 및 동의 철회를 요청할 수 있습니다. 권리 행사와 관련하여 필요한 범위에서 요청자의 권한을 확인하며, 요청의 처리 결과를 안내합니다.',
            '게임 계정 삭제를 원하면 계정 삭제 요청 페이지에서 접수할 수 있습니다. 앱을 기기에서 삭제해도 서버 계정 삭제 요청이 접수되지는 않습니다. 은하열차 키우기는 만 14세 이상이 가입할 수 있습니다.',
          ],
        },
        {
          title: '보호 조치와 방침 변경',
          paragraphs: [
            '개인정보의 접근 권한을 제한하고 계정별 데이터를 분리합니다. 이 방침이 변경되는 경우 변경 내용과 시행일을 안내하고, 추가 동의가 필요한 변경은 별도로 동의를 받습니다.',
          ],
        },
      ],
    },
    terms: {
      title: '이용약관',
      sections: [
        {
          title: '운영자와 이용 대상',
          paragraphs: [
            '이 약관은 운영자 길성규가 제공하는 은하열차 키우기의 이용 조건과 이용자 및 운영자의 권리·의무를 정합니다.',
            '만 14세 이상인 이용자는 약관에 동의하고 제공되는 로그인 방법을 선택하여 가입할 수 있습니다. 미성년자의 유료 구매에는 법정대리인의 동의가 필요할 수 있으며, 동의 없이 체결한 계약은 관련 법령에 따라 취소할 수 있습니다.',
          ],
        },
        {
          title: '계정과 진행 정보',
          paragraphs: [
            '이용자는 자신의 계정을 안전하게 관리하고 다른 사람의 계정을 허락 없이 이용할 수 없습니다. 게스트 계정은 앱 삭제 또는 기기 변경 후 진행을 복구하기 어려울 수 있습니다. 계정 연동, 서버 저장과 복구는 게임 내 안내에 따릅니다.',
          ],
        },
        {
          title: '서비스 제공과 변경',
          paragraphs: [
            '게임에는 무료 콘텐츠, 유료 디지털 상품과 이용자가 선택하여 보는 보상형 광고가 포함될 수 있습니다. 상품 내용, 가격, 수량, 이용 기간과 구매 조건은 구매 화면에서 확인할 수 있으며, 확률형 상품에는 확률을 안내합니다.',
            '안정성, 보안 및 게임 균형을 위해 서비스를 변경할 수 있습니다. 이용자 권리나 유료 콘텐츠에 중요한 변경 또는 서비스 종료가 있는 경우 사유·일정과 적용되는 보상·환급 절차를 안내합니다. 장애·보안 대응으로 사전 고지가 어려운 경우 신속히 사후 안내합니다.',
          ],
        },
        {
          title: '결제, 청약철회와 환불',
          paragraphs: [
            '유료 상품은 이용 중인 앱 마켓을 통해 결제합니다. 구매 확인 전에 최종 가격과 구성, 사용 조건을 확인해 주세요.',
            '관련 법령이 적용되는 경우 일반적으로 계약 내용을 받은 날 또는 상품 공급이 늦으면 공급받은 날부터 7일 이내에 청약철회를 신청할 수 있습니다. 디지털 콘텐츠의 제공이 시작된 경우에도 법령이 정한 요건과 사전 안내 등을 충족할 때만 청약철회를 제한할 수 있습니다. 표시·광고 또는 계약과 다른 상품이 제공된 경우 법령이 정한 권리 및 기간을 따릅니다.',
            '취소와 환불은 마켓의 구매 내역이나 고객지원으로 문의할 수 있습니다. 소비자의 법정 권리는 마켓 정책과 함께 적용됩니다. 중복 지급, 오류 또는 취소 거래는 확인 후 해당 거래 범위에서 정정할 수 있습니다.',
          ],
        },
        {
          title: '이용자 준수사항과 콘텐츠',
          paragraphs: [
            '부정 프로그램·결제 조작, 시스템 악용, 타인 사칭, 계정 탈취, 괴롭힘, 위법한 게시물과 타인의 개인정보 노출은 금지합니다. 위반의 내용과 정도에 따라 콘텐츠 삭제, 채팅 제한 또는 이용 제한을 할 수 있습니다. 긴급 조치를 제외하고 사유와 기간 및 이의 제기 방법을 안내합니다.',
            '게임의 프로그램, 이미지와 음악은 해당 권리자에게 귀속됩니다. 이용자는 게임 안에서 콘텐츠를 이용할 수 있습니다. 이용자가 작성한 콘텐츠의 권리는 이용자에게 있으며, 운영자는 서비스 제공·표시·신고 처리에 필요한 범위에서 이를 이용할 수 있습니다.',
          ],
        },
        {
          title: '개인정보와 알림',
          paragraphs: [
            '개인정보 처리와 권리 행사 방법은 별도의 개인정보처리방침에서 안내합니다. 광고성 알림과 야간 광고성 알림은 별도의 선택 설정에 따릅니다. 기기 알림 권한과 광고 추적 설정도 각각의 권한 절차에 따릅니다.',
          ],
        },
        {
          title: '탈퇴, 분쟁 및 약관 변경',
          paragraphs: [
            '계정 삭제 요청은 게임 내 계정 삭제 기능이 제공되는 경우 해당 기능 또는 웹의 계정 삭제 요청 페이지를 이용할 수 있습니다. 계정 삭제 시 처리되는 진행 데이터와 법령에 따른 보존 사항을 안내합니다. 미사용 유료 상품의 환급 등 이용자의 권리는 적용 법령에 따릅니다.',
            '서비스 관련 문의나 이의는 고객지원으로 접수할 수 있으며, 분쟁은 관련 분쟁조정 절차와 법령이 정한 관할에 따라 해결할 수 있습니다. 약관이 바뀌면 변경 내용, 사유 및 시행일을 공지하고 중요한 변경에는 법령에 따른 절차를 적용합니다.',
          ],
        },
      ],
    },
  },
  en: {
    privacy: {
      title: 'Privacy Policy',
      sections: [
        {
          title: 'Operator and scope',
          paragraphs: [
            'Sungkyu Gil operates Galaxy Express and processes personal information to provide the game and respond to support requests. You can use the Galaxy Express support email shown on this page for privacy inquiries and requests to exercise your rights.',
          ],
        },
        {
          title: 'Information and purposes',
          paragraphs: [
            'We process game account identifiers, sign-in links, and records of progress, items, currency and event activity to provide accounts and to save or restore progress. If you choose Google or Apple sign-in, we process the linked identifier and authentication result received from that provider. The game does not directly collect the account password or payment card number.',
            'We process nicknames, profile decorations, chat messages and their senders and timestamps, and rankings to provide those features. Other players can see information shown on public screens. The device may temporarily cache recent chat messages.',
            'Where real-money purchases are offered, we use product, transaction and receipt identifiers and purchase or fulfillment status to verify purchases, prevent duplicate delivery, and handle cancellations or refunds. Depending on server and SDK settings, connection details, device and app versions, and diagnostics may be processed to maintain the service and resolve errors.',
            'We record age-eligibility confirmation, document versions, acceptance and change times, and optional settings to maintain terms and notification choices. When you email us, we use your sending address, the message and any attachments you choose to include to handle the request.',
          ],
        },
        {
          title: 'Legal basis and choices',
          paragraphs: [
            'We process information necessary to enter into or perform the service contract and retain transaction records when required by law. For processing that requires separate consent, we explain the purpose, information, retention and effects of declining before obtaining consent.',
            'Promotional notifications and nighttime promotional notifications are separately optional. You may withdraw either choice and continue using the game. Where notifications are sent, device permissions and your chosen settings apply.',
          ],
        },
        {
          title: 'Retention and deletion',
          paragraphs: [
            'Account and support information is deleted when its purpose has been fulfilled or account deletion is complete, subject to applicable retention duties. Where required, contract and cancellation records and payment and supply records are retained for five years, consumer complaint and dispute records for three years, and advertising records for six months.',
            'Electronic records are securely deleted once their retention obligation ends. Retention details for chat, connection and diagnostic logs, and backups will reflect the actual operation of the production service.',
          ],
        },
        {
          title: 'External services and international transfers',
          paragraphs: [
            'The game uses Unity Gaming Services and Vivox for game accounts, cloud saves, rankings and chat. Google, Apple or an advertising service may be involved when the corresponding sign-in, payment or advertising feature is used.',
            'We will disclose production processors, their duties and retention, and, where information is transferred overseas, details such as the country, recipient, purpose, legal basis and how to decline, based on the actual service configuration and agreements.',
          ],
        },
        {
          title: 'Your rights',
          paragraphs: [
            'You and your legal representative may request access, correction, deletion or restriction of processing, or withdraw consent, as provided by applicable law. We may verify the requester’s authority as needed and will explain the outcome.',
            'To request deletion of your game account, visit the account deletion request page. Uninstalling the app does not submit a request to delete the server account. Galaxy Express is available to users aged 14 and over.',
          ],
        },
        {
          title: 'Safeguards and changes',
          paragraphs: [
            'We restrict access to personal information and keep account data separate. We will announce changes to this policy and when they take effect. If a change requires further consent, we will request it separately.',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of Service',
      sections: [
        {
          title: 'Operator and eligibility',
          paragraphs: [
            'These terms govern Galaxy Express, its users and its operator, Sungkyu Gil.',
            'Users aged 14 and over may join by accepting the terms and selecting an available sign-in method. Where the law requires a guardian’s consent to a minor’s purchase, the transaction may be cancelled under applicable law if that consent was not obtained.',
          ],
        },
        {
          title: 'Accounts and progress',
          paragraphs: [
            'Keep your account secure and use other accounts only with permission. Guest progress may be difficult to recover after changing devices or uninstalling the app. Follow the game’s instructions for account linking, cloud saving and recovery.',
          ],
        },
        {
          title: 'Service and changes',
          paragraphs: [
            'The game may offer free features, paid digital goods and optional rewarded ads. The relevant screen shows the product, price, quantity, period of use and purchase conditions. Randomized products include disclosures of the applicable probabilities.',
            'We may adjust the service for stability, security and game balance. For a material change affecting users’ rights or paid content, or if the service closes, we will provide the reason, schedule and applicable compensation or refund procedures. If an outage or security issue makes advance notice impractical, we will notify users promptly afterward.',
          ],
        },
        {
          title: 'Payments, withdrawal and refunds',
          paragraphs: [
            'Paid goods are purchased through the relevant app store. Check the final price, contents and conditions of use before confirming a purchase.',
            'Where applicable law provides a right of withdrawal, you can generally exercise it within seven days of receiving the contract information or, if delivery is later, receiving the goods. For digital content that has already been supplied, withdrawal may be restricted only if the required legal conditions and advance disclosures are met. Where goods differ from the advertisement or contract, the applicable statutory rights and time limits apply.',
            'Contact the app store through its purchase history or contact support for cancellations and refunds. We may correct a duplicate, erroneous or cancelled transaction after confirming it. Statutory consumer rights apply.',
          ],
        },
        {
          title: 'Conduct and content',
          paragraphs: [
            'Cheating software, payment manipulation, exploitation, impersonation, account theft, harassment, unlawful posts, and exposing other people’s personal information are prohibited. We may remove content or restrict chat or access in proportion to a violation. Except when urgent action is necessary, we will explain the reason, duration and appeal process.',
            'The software, art and music belong to their respective rights holders. You may use the supplied content within the game. You retain rights to your own content, and we may use it as needed to provide and display the service and handle reports.',
          ],
        },
        {
          title: 'Privacy and notifications',
          paragraphs: [
            'Our separate Privacy Policy describes how we process information and how you can exercise your rights. Promotional and nighttime promotional notifications are separate choices. Device notification permission and advertising tracking follow their respective permission processes.',
          ],
        },
        {
          title: 'Account closure, disputes and changes to terms',
          paragraphs: [
            'You can request account deletion through the in-app feature where available or through the web account deletion request page. We will explain what happens to progress and which data the law requires us to retain. Applicable law governs any right to a refund for unused paid goods.',
            'You can contact support with a question or complaint and use applicable dispute resolution procedures and courts. If these terms change, we will announce what changed, why and when it takes effect, following the procedures required by law for material changes.',
          ],
        },
      ],
    },
  },
}
