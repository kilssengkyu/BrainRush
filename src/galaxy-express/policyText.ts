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
            '계정 생성, 로그인, 진행 저장·복구를 위해 게임 계정 식별자, 로그인 연동 상태, 게임 진행·재화·아이템·이벤트 기록을 처리합니다. Google 또는 Apple 로그인을 선택하면 로그인 제공자가 전달하는 연동 식별자와 인증 결과를 처리합니다.',
            '공개 프로필, 채팅, 랭킹을 제공하기 위해 닉네임, 프로필 장식, 채팅 내용·발신자·시각, 랭킹 점수를 처리합니다. 공개 화면에 표시되는 정보는 다른 이용자가 볼 수 있습니다. 최근 채팅 일부는 기기에 저장될 수 있습니다.',
            '정식 출시 시 App Store와 Google Play 인앱 구매를 제공할 예정입니다. 구매가 활성화되면 해당 마켓이 결제를 처리하고, 운영자는 상품 식별자, 거래 식별자와 검증에 필요한 영수증 정보, 거래·지급 상태를 구매 확인, 중복 지급 방지, 취소 및 환불 처리에 이용합니다. 결제 카드 정보는 이용한 마켓에서 처리합니다.',
            '정식 출시 시 Google AdMob 보상형 광고를 제공할 예정입니다. 광고가 활성화되면 광고 SDK는 설정과 이용자의 선택에 따라 IP 주소, 기기 또는 광고 식별자, 광고 노출·클릭 등의 이용 기록, 오류·성능 정보를 광고 제공, 성과 측정 및 부정 이용 방지에 처리할 수 있습니다.',
            '서비스 연결과 오류 대응을 위해 접속 정보, 기기·앱 버전 및 진단 정보가 서버와 SDK 설정에 따라 처리될 수 있습니다.',
            '약관 확인과 알림 설정을 위해 만 14세 이상 확인 결과, 문서 버전, 동의·변경 시각, 선택 설정을 기록합니다. 이메일 문의를 보내면 발신 주소, 문의 내용과 이용자가 첨부한 정보를 요청 확인 및 답변에 이용합니다.',
          ],
        },
        {
          title: '처리 근거와 선택 설정',
          paragraphs: [
            '계정 제공·저장 등에 필요한 정보는 계약 체결·이행을 위해 처리하고, 법정 거래 기록은 해당 법령에 따라 보존합니다. 별도 동의가 필요한 처리는 목적, 정보 항목, 보유기간과 거부에 따른 영향을 안내하고 동의를 받습니다.',
            '보상형 광고 시청은 선택입니다. 광고 관련 선택은 해당되는 지역의 동의 화면과 제공되는 개인정보 선택 메뉴 또는 기기의 추적·광고 설정에서 관리할 수 있습니다. 광고성 알림 수신과 야간 광고성 알림 수신은 각각 선택 사항이며 선택을 철회해도 기본 게임을 이용할 수 있습니다. 실제 발송을 제공하는 경우 기기의 알림 권한과 게임에서 선택한 수신 설정을 함께 적용합니다.',
          ],
        },
        {
          title: '보유기간과 파기',
          paragraphs: [
            '계정 정보는 처리 목적이 달성되거나 계정 삭제가 완료되면 파기합니다. 일반 고객지원 이메일은 후속 대응을 위해 처리 완료일부터 최대 90일간 보관한 후 파기합니다.',
            '법령에 따라 보존해야 하는 기록은 일반 고객지원 이메일과 별개로 해당 목적에 한해 보존합니다. 대한민국 전자상거래법령이 적용되는 경우 계약·청약철회 및 결제·공급 기록은 5년, 소비자 불만·분쟁 처리 기록은 3년, 표시·광고 기록은 6개월 보존합니다.',
            '보존 의무가 끝난 전자 기록은 복구하기 어려운 방식으로 파기합니다.',
            'Unity의 서비스 기본 기준에 따르면 Authentication의 계정 데이터는 이용자나 운영자가 삭제할 때까지, Cloud Save의 저장 데이터는 운영자가 삭제할 때까지 보존됩니다. 계정 삭제 요청은 Authentication과 Cloud Save에서 각각 처리합니다.',
            'Leaderboards의 순위 기록은 삭제 또는 초기화 전까지 보존되며, 초기화 시 보관 기능이 활성화되어 있으면 기록이 별도로 보존됩니다. Unity의 관리자 삭제 기능은 현재 순위 기록에 적용됩니다. Cloud Code가 자체 수집하는 개인정보는 최대 30일 보존되며, 열람이나 삭제는 운영자가 Unity 지원을 통해 요청할 수 있습니다.',
            'Vivox의 기본 채팅 이력 저장 기간은 7일이며, 텍스트 증거 관리 기능을 켠 경우 30일입니다. Vivox는 이용자 식별자, 기기 식별자, 일부를 제거한 IP 주소를 기본 최대 30일 보관합니다. 운영자는 Vivox 지원을 통해 해당 정보의 삭제를 요청할 수 있습니다. 정식 환경의 채팅 설정, 보관된 순위 기록의 삭제 방법 및 백업 파기 일정은 확인 후 공개합니다.',
          ],
        },
        {
          title: '외부 서비스와 국외 이전',
          paragraphs: [
            'Unity 규약에 따른 수탁자는 Unity Technologies S.F.(미국, dpo@unity3d.com)입니다. Unity Gaming Services는 게임 로그인, 저장, 서버 처리 및 랭킹에, Vivox는 텍스트 채팅에 이용됩니다.',
            'Unity가 공개한 재수탁자 목록에서 Google Cloud Platform의 해당 서비스 처리 가능 지역은 미국, 독일, 벨기에, 브라질, 싱가포르, 호주, 대만입니다. Vivox에 등재된 Amazon Web Services의 처리 가능 지역은 미국, 독일, 브라질, 싱가포르, 호주이며, Unity는 Vivox의 처리 위치가 고객 설정에 따라 달라진다고 설명합니다. 이 지역들은 Unity가 해당 서비스에 대해 공개한 범위입니다. 정식 게임에 적용되는 처리 국가와 국외 이전의 근거, 시기, 방법 및 거부 방법은 운영 설정을 확인해 공개합니다.',
            '선택한 로그인에 Google 또는 Apple 로그인 서비스가 관여합니다. 정식 출시용 인앱 결제에는 Apple App Store 또는 Google Play, 보상형 광고에는 Google AdMob을 사용할 예정입니다.',
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
            '게임은 무료 콘텐츠를 제공하며 정식 출시 시 유료 디지털 상품과 이용자가 선택하여 보는 보상형 광고가 제공될 예정입니다. 상품 내용, 가격, 수량, 이용 기간과 구매 조건은 구매 화면에서 안내합니다. 확률형 상품의 종류별 당첨 확률은 구매 전에 확인할 수 있습니다.',
            '안정성, 보안 및 게임 균형을 위해 서비스를 변경할 수 있습니다. 이용자 권리나 유료 콘텐츠에 중요한 변경이 있으면 사유·일정과 적용되는 보상·환급 절차를 사전에 안내합니다. 장애·보안 대응으로 사전 고지가 어려운 경우에는 신속히 사후 안내합니다.',
            '서비스를 종료하는 경우 종료 일정과 미사용 유료 콘텐츠의 환급 대상·방법을 사전에 공지하고, 종료일부터 최소 30일 동안 환급 요청을 처리하는 고객지원 창구를 운영합니다.',
          ],
        },
        {
          title: '결제, 청약철회와 환불',
          paragraphs: [
            '유료 상품은 이용 중인 앱 마켓을 통해 결제합니다. 결제 전에 최종 가격, 상품 구성과 사용 조건을 확인해 주세요. 상품은 건별 결제이며 월간 시즌 패스도 해당 시즌의 한 번 구매로 적용됩니다. 새 시즌에는 별도로 구매할 수 있습니다.',
            '대한민국 전자상거래법이 적용되는 경우 계약 내용이 적힌 서면을 받은 날부터 7일 이내에 청약철회를 할 수 있습니다. 상품 공급이 더 늦으면 공급받거나 공급이 시작된 날부터 7일을 계산합니다. 법령이 정한 제한 사유와 사전 고지 등의 요건을 충족하는 경우에만 청약철회를 제한할 수 있으며, 나눌 수 있는 디지털 콘텐츠에서 제공을 시작하지 않은 부분은 청약철회를 할 수 있습니다.',
            '대한민국 전자상거래법이 적용되고 상품 내용이 표시·광고 또는 계약과 다른 경우에는 상품을 공급받은 날부터 3개월 이내이면서 그 사실을 알았거나 알 수 있었던 날부터 30일 이내에 청약철회를 할 수 있습니다.',
            '취소와 환불은 마켓의 구매 내역이나 고객지원으로 요청할 수 있습니다. 중복 지급, 오류 또는 취소 거래는 확인 후 해당 거래의 범위에서 정정할 수 있습니다. 거주지에서 적용되는 강행 소비자 보호 법령에 따른 권리는 그대로 보장됩니다.',
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
            '서비스 관련 문의나 이의는 고객지원으로 접수할 수 있으며, 분쟁은 거주지의 강행 소비자 보호 규정이 보장하는 분쟁조정 절차나 관할 법원 등을 이용할 수 있습니다.',
            '약관 변경 시 변경 내용·사유·시행일을 시행 최소 7일 전에 공지합니다. 이용자에게 불리하거나 중요한 변경은 최소 30일 전에 공지하고 해당 이용자에게 별도로 알립니다. 적용 법령에서 더 긴 기간이나 별도 동의를 요구하면 그 절차를 따릅니다.',
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
            'We process game account identifiers, sign-in links, and records of progress, items, currency and event activity to provide accounts and to save or restore progress. If you choose Google or Apple sign-in, we process the linked identifier and authentication result received from that provider.',
            'We process nicknames, profile decorations, chat messages and their senders and timestamps, and rankings to provide those features. Other players can see information shown on public screens. Some recent chat messages may be saved on the device.',
            'We plan to offer App Store and Google Play in-app purchases at launch. Once purchases are enabled, your store will process the payment and payment card details. We will use product and transaction identifiers, the receipt information needed for verification, and purchase or delivery status to verify purchases, prevent duplicate grants, and handle cancellations or refunds.',
            'We plan to offer Google AdMob rewarded ads at launch. Once ads are enabled, the advertising SDK may process IP address, device or advertising identifiers, ad impressions and clicks, and crash and performance data for ad delivery, measurement and fraud prevention, depending on its configuration and your choices.',
            'Depending on server and SDK settings, we may process connection details, device and app versions, and diagnostics to maintain the service and resolve errors.',
            'We record age-eligibility confirmation, document versions, acceptance and change times, and optional settings to maintain terms and notification choices. When you email us, we use your sending address, the message and any attachments you choose to include to handle the request.',
          ],
        },
        {
          title: 'Legal basis and choices',
          paragraphs: [
            'We process information necessary to enter into or perform the service contract and retain transaction records when required by law. For processing that requires separate consent, we explain the purpose, information, retention and effects of declining before obtaining consent.',
            'Watching rewarded ads is optional. You can manage ad choices through consent screens and privacy choices where available, or through your device’s tracking and advertising settings. Promotional and nighttime promotional notifications are separately optional. You may withdraw either choice and continue using the game. Where notifications are sent, device permissions and your chosen settings apply.',
          ],
        },
        {
          title: 'Retention and deletion',
          paragraphs: [
            'We delete account information when its purpose has been fulfilled or account deletion is complete. We keep ordinary support emails for follow-up for up to 90 days after resolving the request and then delete them.',
            'We retain records separately for the purposes and duration required by applicable law. Where South Korean e-commerce law applies, we retain contract, withdrawal, payment and supply records for five years, consumer complaint and dispute records for three years, and advertising records for six months.',
            'Electronic records are securely deleted once their retention obligation ends.',
            'Under Unity’s service defaults, Authentication keeps account data until the player or operator deletes it. Cloud Save keeps stored data until the operator deletes it. We process account deletion requests separately in Authentication and Cloud Save.',
            'Leaderboards keeps rankings until deletion or reset. If archiving is enabled, a reset preserves a separate copy. Unity’s administrative score deletion applies to live rankings. Cloud Code keeps the personal data it collects for up to 30 days. The operator can request access or deletion through Unity support.',
            'Vivox stores chat history for seven days by default, or 30 days when Text Evidence Management is enabled. By default, Vivox keeps user identifiers, device identifiers and truncated IP addresses for up to 30 days. The operator can request deletion through Vivox support. We will confirm the production chat settings, how archived rankings can be erased, and the backup deletion schedule before publishing those details.',
          ],
        },
        {
          title: 'External services and international transfers',
          paragraphs: [
            'Unity Technologies S.F. (United States, dpo@unity3d.com) is the processor under Unity’s terms. We use Unity Gaming Services for game sign-in, cloud saves, server processing and rankings, and Vivox for text chat.',
            'Unity lists the United States, Germany, Belgium, Brazil, Singapore, Australia and Taiwan as possible processing locations for the relevant services on Google Cloud Platform. It also lists the United States, Germany, Brazil, Singapore and Australia for Amazon Web Services, which is listed for Vivox. Unity says Vivox processing locations depend on the customer’s configuration. These are Unity’s published locations for the services. We will confirm the countries applicable to the production game and then publish the legal basis, timing and method of transfer and how to decline it.',
            'Google and Apple provide optional sign-in. For launch, we plan to use Apple App Store or Google Play for in-app purchases and Google AdMob for rewarded ads.',
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
            'The game offers free content, with paid digital goods and optional rewarded ads planned for launch. The purchase screen shows the product, price, quantity, period of use and purchase conditions. You can check the odds for each type of randomized item before buying.',
            'We may adjust the service for stability, security and game balance. We will give advance notice of material changes affecting users’ rights or paid content, including the reason, schedule and any compensation or refund process. If an outage or security issue makes advance notice impractical, we will notify users promptly afterward.',
            'If we close the service, we will give advance notice of the closure date, eligibility and process for refunds on unused paid content. Support will handle refund requests for at least 30 days after closure.',
          ],
        },
        {
          title: 'Payments, withdrawal and refunds',
          paragraphs: [
            'Paid goods are purchased through your app store. Check the final price, contents and conditions of use before confirming a purchase. Each purchase is a one-time charge. A monthly season pass covers the season you buy and can be bought separately in a new season.',
            'Where South Korean e-commerce law applies, you can withdraw within seven days of receiving the contract details in writing. If delivery takes place later, the period begins when you receive the product or delivery starts. Restrictions on withdrawal apply only when the legal conditions and required advance disclosures are met. If digital content is divisible, you can still withdraw from any part that has yet to be supplied.',
            'Where South Korean e-commerce law applies and the product differs from the advertisement or contract, you can withdraw within three months of delivery and within 30 days of knowing, or when you could have known, about the difference.',
            'You can request a cancellation or refund through your app store’s purchase history or by contacting support. After verifying a duplicate delivery, error or cancelled transaction, we may correct the affected transaction. You retain the rights granted by mandatory consumer protection laws that apply where you live.',
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
            'You can contact support with a question or complaint and use any dispute resolution procedures or courts available under the mandatory consumer rules that apply where you live.',
            'We will announce changes to these terms, the reasons and the effective date at least seven days in advance. For material changes or changes that disadvantage users, we will announce them at least 30 days in advance and notify affected users individually. If applicable law requires more notice or separate consent, we will follow those requirements.',
          ],
        },
      ],
    },
  },
}
