import { useState, useEffect } from 'react'
import { HelpCircle, ChevronDown, ChevronUp, Mail, Send, MessageCircle, Search, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const buildFAQ = ({ minWithdrawal, referralBonus }) => [
  {
    category: 'Wallet & Payments',
    questions: [
      {
        q: 'When will I receive my payment?',
        a: `Once your review or install task is approved by admin, the reward is instantly added to your wallet. You can request a withdrawal when your balance reaches ₹${minWithdrawal} or more. Payments are processed within 24-48 hours to your UPI or bank account.`,
        keywords: ['paise', 'kab', 'milenge', 'wallet', 'money', 'when', 'payment'],
      },
      {
        q: 'Why haven\'t I received my payment yet?',
        a: 'There could be several reasons:\n\n1. Your review is still pending — admin needs to approve it.\n2. Your withdrawal request is being processed (takes 24-48 hours).\n3. Your UPI ID is incorrect — check in your Profile.\n4. Your phone number is not verified — verify on the Wallet page.\n5. You haven\'t reached the minimum withdrawal amount.',
        keywords: ['nahi', 'mile', 'paise', 'kyun', 'not', 'received', 'pending', 'stuck'],
      },
      {
        q: 'What is the minimum withdrawal amount?',
        a: `The minimum withdrawal amount is ₹${minWithdrawal}. You cannot submit a withdrawal request until your wallet balance reaches ₹${minWithdrawal}.`,
        keywords: ['minimum', 'withdrawal', 'kitna', 'limit', 'kam'],
      },
      {
        q: 'How to change my UPI ID?',
        a: 'Go to Wallet page → Click "Edit" in the UPI ID section → Enter your new UPI ID → Save. You can also update it from the Profile page.',
        keywords: ['upi', 'change', 'edit', 'update', 'bank'],
      },
      {
        q: 'Why was my withdrawal rejected?',
        a: 'Possible reasons for withdrawal rejection:\n\n1. Your UPI ID is invalid or inactive.\n2. Suspicious activity detected on your account.\n3. Phone number is not verified.\n\nIf rejected, the amount is returned to your wallet.',
        keywords: ['reject', 'withdrawal', 'failed', 'wapas', 'refund'],
      },
    ],
  },
  {
    category: 'Reviews & Earning',
    questions: [
      {
        q: 'How do I submit a review?',
        a: 'Go to the Home page and browse available apps. Tap any app → Download from Play Store → Use the app → Write a review → Upload screenshot → Submit. Reward will be added to your wallet after admin approval.',
        keywords: ['review', 'kaise', 'how', 'karu', 'earn', 'start'],
      },
      {
        q: 'How long does review approval take?',
        a: 'Usually, admin reviews submissions within 1-24 hours. It may take longer during peak times. Please be patient!',
        keywords: ['approve', 'time', 'kitna', 'hours', 'wait', 'pending'],
      },
      {
        q: 'Why was my review rejected?',
        a: 'Common reasons:\n\n1. Screenshot is unclear or from the wrong app.\n2. Review text is too short or irrelevant.\n3. Same review was copy-pasted.\n4. App was not used properly (too little time).\n5. Duplicate or fake review detected.',
        keywords: ['reject', 'review', 'kyun', 'reason', 'hota'],
      },
      {
        q: 'Can I review the same app again?',
        a: 'Normally, each user can review an app only once. However, if the admin has whitelisted you, you can submit multiple reviews.',
        keywords: ['dobara', 'again', 'multiple', 'same', 'app', 'ek'],
      },
      {
        q: 'What is the daily reward?',
        a: 'Open the app daily and tap the "Claim" button to earn free rewards! Claiming for 7 consecutive days earns you a streak bonus. Missing a day resets your streak.',
        keywords: ['daily', 'reward', 'claim', 'streak', 'free'],
      },
    ],
  },
  {
    category: 'Install Tasks',
    questions: [
      {
        q: 'What is an install task?',
        a: 'In an install task, you simply need to install and use the app, then submit a full screenshot from inside the app. No review writing is required. The reward will be added to your wallet after admin approval.',
        keywords: ['install', 'task', 'kya', 'what', 'difference'],
      },
      {
        q: 'What\'s the difference between install and review tasks?',
        a: 'In a review task, you need to write a 5-star review on Play Store and submit a screenshot of it. In an install task, you just download and use the app, then submit a screenshot from inside the app — no review writing needed.',
        keywords: ['fark', 'difference', 'review', 'install', 'compare'],
      },
      {
        q: 'How to take a screenshot for install tasks?',
        a: 'After installing the app, open it and navigate to any screen. Take a full screenshot (do not crop it) and submit it.',
        keywords: ['screenshot', 'install', 'kaise', 'how', 'crop'],
      },
    ],
  },
  {
    category: 'Account & Security',
    questions: [
      {
        q: 'How to verify my phone number?',
        a: 'Go to the Wallet page → Enter your 10-digit number in the "WhatsApp Verification" section → Submit → A verification code will appear in the app (after fraud check) → Enter the code → Done!',
        keywords: ['phone', 'verify', 'number', 'whatsapp', 'otp'],
      },
      {
        q: 'Why was my account banned?',
        a: 'Reasons for account bans:\n\n1. Submitting fake reviews.\n2. Creating multiple accounts from the same device.\n3. Fraudulent activity detected.\n4. Spam or abusive behavior.\n\nIf you believe it was a mistake, please contact support.',
        keywords: ['ban', 'block', 'suspended', 'kyun', 'account'],
      },
      {
        q: 'Forgot my password?',
        a: 'Click "Forgot Password" on the login page → Enter your email → You\'ll receive a reset link → Use the link to set a new password.',
        keywords: ['password', 'forgot', 'bhool', 'reset', 'login'],
      },
      {
        q: 'Can I create only one account per device?',
        a: 'Yes, for fraud prevention, only one account is allowed per device. If you want to create a new account, the previous one must be deleted first. Using multiple accounts may result in a ban.',
        keywords: ['device', 'account', 'multiple', 'ek', 'new'],
      },
    ],
  },
  {
    category: 'Referral Program',
    questions: [
      {
        q: 'How to earn through referrals?',
        a: 'Go to Profile → "Refer & Earn" → Share your referral code or link → When your friend signs up and completes their first review → Both of you earn a bonus!',
        keywords: ['referral', 'refer', 'earn', 'code', 'share', 'friend'],
      },
      {
        q: 'When do I receive the referral bonus?',
        a: `The referral bonus is awarded when your referred user's first review is approved. ₹${referralBonus} will be automatically added to your wallet. Minimum balance of ₹${minWithdrawal} is required to withdraw.`,
        keywords: ['referral', 'bonus', 'kab', 'credit', 'when'],
      },
      {
        q: 'How to apply a referral code?',
        a: 'Go to the Referral page → Enter the code in "Have a referral code?" section → Tap "Apply". Note: You can only apply a referral code once after signup.',
        keywords: ['apply', 'code', 'referral', 'enter', 'use'],
      },
    ],
  },
]

export default function HelpSupport() {
  const [search, setSearch] = useState('')
  const [openIdx, setOpenIdx] = useState(null)
  const [settings, setSettings] = useState({ minWithdrawal: 10, referralBonus: 10 })

  // Load admin-controlled amounts so FAQ answers stay in sync.
  useEffect(() => {
    supabase.from('settings').select('key, value').in('key', ['min_withdrawal', 'referral_bonus']).then(({ data }) => {
      if (!data) return
      const map = Object.fromEntries(data.map((r) => [r.key, r.value]))
      const parse = (v, fb) => {
        const n = Number(String(v ?? '').replace(/[^\d.]/g, ''))
        return Number.isFinite(n) && n > 0 ? n : fb
      }
      setSettings({
        minWithdrawal: parse(map.min_withdrawal, 10),
        referralBonus: parse(map.referral_bonus, 10),
      })
    })
  }, [])

  const FAQ_DATA = buildFAQ(settings)

  const allQuestions = FAQ_DATA.flatMap((cat) =>
    cat.questions.map((q) => ({ ...q, category: cat.category }))
  )

  const filtered = search.trim()
    ? allQuestions.filter((item) => {
      const term = search.toLowerCase()
      return (
        item.q.toLowerCase().includes(term) ||
        item.a.toLowerCase().includes(term) ||
        item.keywords.some((k) => term.includes(k) || k.includes(term))
      )
    })
    : null

  const toggleFaq = (key) => {
    setOpenIdx(openIdx === key ? null : key)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card relative overflow-hidden bg-gradient-to-br from-brand-500 to-violet-600 text-white">
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
        <div className="relative">
          <HelpCircle size={24} className="mb-2 opacity-80" />
          <h2 className="text-lg font-bold">Help & Support</h2>
          <p className="text-xs text-white/80">Find answers to your questions here</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-3.5 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Type your question... (e.g. when will I get paid)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Search Results */}
      {filtered && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} found
          </p>
          {filtered.length === 0 ? (
            <div className="card py-6 text-center">
              <p className="text-sm text-slate-400">No results found. Try contacting support below.</p>
            </div>
          ) : (
            filtered.map((item, i) => (
              <div key={i} className="card">
                <button
                  onClick={() => toggleFaq(`search-${i}`)}
                  className="flex w-full items-start justify-between gap-2 text-left"
                >
                  <div>
                    <p className="text-sm font-bold">{item.q}</p>
                    <span className="text-[10px] text-brand-500">{item.category}</span>
                  </div>
                  {openIdx === `search-${i}` ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
                </button>
                {openIdx === `search-${i}` && (
                  <p className="mt-2 whitespace-pre-line border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    {item.a}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* FAQ Categories */}
      {!filtered && (
        <div className="space-y-4">
          {FAQ_DATA.map((cat, ci) => (
            <div key={ci}>
              <p className="mb-2 text-sm font-bold text-slate-600 dark:text-slate-300">{cat.category}</p>
              <div className="space-y-2">
                {cat.questions.map((item, qi) => {
                  const key = `${ci}-${qi}`
                  return (
                    <div key={key} className="card">
                      <button
                        onClick={() => toggleFaq(key)}
                        className="flex w-full items-center justify-between gap-2 text-left"
                      >
                        <p className="text-sm font-semibold">{item.q}</p>
                        {openIdx === key ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
                      </button>
                      {openIdx === key && (
                        <p className="mt-2 whitespace-pre-line border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                          {item.a}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact Section */}
      <div className="card space-y-3">
        <h3 className="flex items-center gap-2 font-bold">
          <MessageCircle size={16} className="text-brand-500" /> Contact Us
        </h3>
        <p className="text-xs text-slate-400">Couldn't find your answer? Reach out to us:</p>

        <a
          href="mailto:support@appdo.in"
          className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition active:scale-[0.98] dark:bg-slate-800/50"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/10">
            <Mail size={18} />
          </div>
          <div>
            <p className="text-sm font-bold">Email Support</p>
            <p className="text-xs text-slate-400">support@appdo.in</p>
          </div>
        </a>

        <a
          href="https://t.me/earnbyappdo"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition active:scale-[0.98] dark:bg-slate-800/50"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0088cc]/10 text-[#0088cc]">
            <Send size={18} />
          </div>
          <div>
            <p className="text-sm font-bold">Telegram</p>
            <p className="text-xs text-slate-400">@earnbyappdo</p>
          </div>
        </a>

        <p className="text-[10px] text-center text-slate-400">Response time: 12-24 hours</p>
      </div>

      {/* Back */}
      <button onClick={() => window.history.back()} className="btn-soft w-full py-2.5 text-sm">
        <ArrowLeft size={15} /> Go Back
      </button>
    </div>
  )
}
