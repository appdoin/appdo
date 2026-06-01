import { useState, useEffect } from 'react'
import { HelpCircle, ChevronDown, ChevronUp, Mail, Send, MessageCircle, Search, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const buildFAQ = ({ minWithdrawal, referralBonus }) => [
  {
    category: 'Wallet & Payments',
    questions: [
      {
        q: 'Wallet se paise kab milenge?',
        a: 'Jab aapka review admin dwara approve ho jata hai, to reward turant aapke wallet me credit ho jata hai. Withdrawal request karne ke baad 24-48 hours me aapke UPI ID par payment process hota hai.',
        keywords: ['paise', 'kab', 'milenge', 'wallet', 'money', 'when', 'payment'],
      },
      {
        q: 'Mere paise mujhe kyun nahi mile abhi tak?',
        a: 'Iske kuch reasons ho sakte hain:\n\n1. Aapka review abhi pending hai — admin ko approve karna hoga.\n2. Withdrawal request processing me hai (24-48 hours lagti hai).\n3. UPI ID galat hai — Profile me check karein.\n4. Phone number verify nahi hai — Wallet page pe verify karein.\n5. Minimum withdrawal amount complete nahi hua.',
        keywords: ['nahi', 'mile', 'paise', 'kyun', 'not', 'received', 'pending', 'stuck'],
      },
      {
        q: 'Minimum withdrawal kitna hai?',
        a: `Minimum withdrawal amount ₹${minWithdrawal} hai. Jab tak aapke wallet me ₹${minWithdrawal} nahi hote, tab tak aap withdrawal request nahi bhej sakte.`,
        keywords: ['minimum', 'withdrawal', 'kitna', 'limit', 'kam'],
      },
      {
        q: 'UPI ID kaise change karein?',
        a: 'Wallet page par jaiye → UPI ID section me "Edit" button dabayein → Naya UPI ID enter karein → Save karein. Ya Profile page se bhi update kar sakte hain.',
        keywords: ['upi', 'change', 'edit', 'update', 'bank'],
      },
      {
        q: 'Withdrawal reject kyun hua?',
        a: 'Withdrawal reject hone ke reasons:\n\n1. UPI ID invalid ya inactive hai.\n2. Account me suspicious activity detect hui.\n3. Phone number verified nahi hai.\n\nReject hone par amount wapas wallet me aa jata hai.',
        keywords: ['reject', 'withdrawal', 'failed', 'wapas', 'refund'],
      },
    ],
  },
  {
    category: 'Reviews & Earning',
    questions: [
      {
        q: 'Review kaise karu?',
        a: 'Home page par available apps dikhte hain. Kisi bhi app par tap karein → Play Store se download karein → App use karein → Review likhein → Screenshot upload karein → Submit. Admin approval ke baad paise mil jayenge.',
        keywords: ['review', 'kaise', 'how', 'karu', 'earn', 'start'],
      },
      {
        q: 'Review approve hone me kitna time lagta hai?',
        a: 'Normally 1-24 hours me admin review check karta hai. Peak time me thoda zyada lag sakta hai. Patience rakhein!',
        keywords: ['approve', 'time', 'kitna', 'hours', 'wait', 'pending'],
      },
      {
        q: 'Review reject kyun hota hai?',
        a: 'Common reasons:\n\n1. Screenshot clear nahi hai ya galat app ka hai.\n2. Review text bahut chota ya irrelevant hai.\n3. Same review copy-paste kiya hai.\n4. App properly use nahi kiya (time bahut kam).\n5. Duplicate ya fake review detect hua.',
        keywords: ['reject', 'review', 'kyun', 'reason', 'hota'],
      },
      {
        q: 'Ek app ko dobara review kar sakte hain?',
        a: 'Normally ek user ek app ko sirf ek baar review kar sakta hai. Lekin agar admin ne aapko whitelist kiya hai to aap multiple baar review kar sakte hain.',
        keywords: ['dobara', 'again', 'multiple', 'same', 'app', 'ek'],
      },
      {
        q: 'Daily reward kya hai?',
        a: 'Har din app kholein aur "Claim" button dabayein — free me paise milenge! 7 din continuous claim karne par streak bonus milta hai. Ek din miss karne par streak reset ho jata hai.',
        keywords: ['daily', 'reward', 'claim', 'streak', 'free'],
      },
    ],
  },
  {
    category: 'Account & Security',
    questions: [
      {
        q: 'Phone number kaise verify karein?',
        a: 'Wallet page par "WhatsApp Verification" section me apna 10-digit number enter karein → Request submit karein → Verification code app me dikhega (fraud check ke baad) → Code enter karein → Done!',
        keywords: ['phone', 'verify', 'number', 'whatsapp', 'otp'],
      },
      {
        q: 'Account ban kyun hua?',
        a: 'Account ban hone ke reasons:\n\n1. Fake reviews submit kiye.\n2. Multiple accounts banayi same device se.\n3. Fraud activity detect hui.\n4. Spam ya abusive behavior.\n\nAgar aapko lagta hai galti se ban hua hai to support me contact karein.',
        keywords: ['ban', 'block', 'suspended', 'kyun', 'account'],
      },
      {
        q: 'Password bhool gaya?',
        a: 'Login page par "Forgot Password" link par click karein → Email enter karein → Reset link milega email me → Link se naya password set karein.',
        keywords: ['password', 'forgot', 'bhool', 'reset', 'login'],
      },
      {
        q: 'Ek device se ek hi account bana sakte hain?',
        a: 'Haan, fraud prevention ke liye ek device se sirf ek account allowed hai. Agar aap naya account banana chahte hain to pehle wala delete karna hoga. Multiple accounts se ban ho sakta hai.',
        keywords: ['device', 'account', 'multiple', 'ek', 'new'],
      },
    ],
  },
  {
    category: 'Referral Program',
    questions: [
      {
        q: 'Referral se kaise kamayein?',
        a: 'Profile page → "Refer & Earn" par jayein → Apna referral code ya link share karein → Jab aapka friend signup karke pehla review complete karega → Dono ko bonus milega!',
        keywords: ['referral', 'refer', 'earn', 'code', 'share', 'friend'],
      },
      {
        q: 'Referral bonus kab milta hai?',
        a: `Referral bonus tab milta hai jab aapke dwara referred user ka pehla review approve ho jata hai. Tab ₹${referralBonus} aapke wallet me automatically credit ho jata hai.`,
        keywords: ['referral', 'bonus', 'kab', 'credit', 'when'],
      },
      {
        q: 'Referral code kaise apply karein?',
        a: 'Referral page par "Have a referral code?" section me code enter karein aur "Apply" button dabayein. Note: Sirf signup ke baad ek baar hi apply kar sakte hain.',
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
          <p className="text-xs text-white/80">Apne sawal ka jawab yahan dhundhein</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-3.5 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Apna sawal type karein... (e.g. paise kab milenge)"
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
              <p className="text-sm text-slate-400">Koi result nahi mila. Neeche contact karein.</p>
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
        <p className="text-xs text-slate-400">Agar aapka sawal upar nahi mila to humse contact karein:</p>

        <a
          href="mailto:support@rewardreview.app"
          className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition active:scale-[0.98] dark:bg-slate-800/50"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/10">
            <Mail size={18} />
          </div>
          <div>
            <p className="text-sm font-bold">Email Support</p>
            <p className="text-xs text-slate-400">support@rewardreview.app</p>
          </div>
        </a>

        <a
          href="https://t.me/rewardreview_support"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition active:scale-[0.98] dark:bg-slate-800/50"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0088cc]/10 text-[#0088cc]">
            <Send size={18} />
          </div>
          <div>
            <p className="text-sm font-bold">Telegram</p>
            <p className="text-xs text-slate-400">@rewardreview_support</p>
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
