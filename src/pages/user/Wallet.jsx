import { useEffect, useState } from 'react'
import { CreditCard, Phone, Pencil, Check, ArrowDownToLine, Landmark, Smartphone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/Toast'
import PhoneVerify from '../../components/PhoneVerify'
import { rupee, formatDate, niceError } from '../../lib/format'

export default function Wallet() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [upi, setUpi] = useState(profile?.upi_id || '')
  const [editUpi, setEditUpi] = useState(false)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [min, setMin] = useState(10)

  // Payment method + bank details
  const [method, setMethod] = useState(profile?.payout_method || 'upi')
  const [bank, setBank] = useState({
    account_holder_name: profile?.account_holder_name || '',
    bank_account_number: profile?.bank_account_number || '',
    bank_ifsc: profile?.bank_ifsc || '',
  })
  const [editBank, setEditBank] = useState(false)
  const [savingMethod, setSavingMethod] = useState(false)

  useEffect(() => {
    setUpi(profile?.upi_id || '')
    setMethod(profile?.payout_method || 'upi')
    setBank({
      account_holder_name: profile?.account_holder_name || '',
      bank_account_number: profile?.bank_account_number || '',
      bank_ifsc: profile?.bank_ifsc || '',
    })
  }, [profile?.upi_id, profile?.payout_method, profile?.account_holder_name, profile?.bank_account_number, profile?.bank_ifsc])

  useEffect(() => {
    supabase.from('withdrawals').select('*').order('created_at', { ascending: false }).then(({ data }) => setHistory(data ?? []))
    supabase.from('settings').select('value').eq('key', 'min_withdrawal').single().then(({ data }) => data && setMin(Number(data.value)))
  }, [])

  const saveUpi = async () => {
    await supabase.from('profiles').update({ upi_id: upi }).eq('id', profile.id)
    setEditUpi(false)
    refreshProfile()
    toast.success('UPI ID updated.')
  }

  const chooseMethod = async (m) => {
    setMethod(m)
    setSavingMethod(true)
    try {
      await supabase.from('profiles').update({ payout_method: m }).eq('id', profile.id)
      refreshProfile()
    } catch (e) { toast.error(niceError(e)) } finally { setSavingMethod(false) }
  }

  const saveBank = async () => {
    if (!bank.account_holder_name || !bank.bank_account_number || !bank.bank_ifsc) {
      return toast.error('Fill all bank fields.')
    }
    setSavingMethod(true)
    try {
      const { error } = await supabase.from('profiles').update({
        account_holder_name: bank.account_holder_name.trim(),
        bank_account_number: bank.bank_account_number.trim(),
        bank_ifsc: bank.bank_ifsc.trim().toUpperCase(),
        payout_method: 'bank',
      }).eq('id', profile.id)
      if (error) throw error
      setEditBank(false)
      refreshProfile()
      toast.success('Bank details saved.')
    } catch (e) { toast.error(niceError(e)) } finally { setSavingMethod(false) }
  }

  const withdraw = async () => {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('request_withdrawal', { p_amount: Number(amount), p_upi: method === 'upi' ? (upi || null) : null })
      if (error) throw error
      toast.success('Withdrawal requested!')
      setAmount('')
      refreshProfile()
      const { data } = await supabase.from('withdrawals').select('*').order('created_at', { ascending: false })
      setHistory(data ?? [])
    } catch (err) {
      toast.error(niceError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 animate-stagger">
      {/* Balance — Premium Glass */}
      <div className="glass-shine relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-violet-700 p-5 text-white shadow-lg shadow-brand-500/25 animate-slide-up">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl animate-pulse-soft" />
        <div className="absolute -bottom-8 left-8 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] blur-3xl" />
        <div className="decor-leaf leaf-1" style={{ opacity: 0.25 }} />
        <div className="decor-leaf leaf-2" style={{ opacity: 0.2 }} />
        <div className="decor-leaf leaf-3" style={{ opacity: 0.2 }} />
        <p className="relative flex items-center gap-1.5 text-[11px] font-medium text-white/70 uppercase tracking-wider"><CreditCard size={13} /> Available Balance</p>
        <p className="relative mt-1 text-3xl font-extrabold tracking-tight">{rupee(profile?.wallet_balance)}</p>
        <p className="relative mt-1 text-[11px] text-white/60">Total earned {rupee(profile?.total_earned)}</p>
      </div>

      {/* WhatsApp verification */}
      <PhoneVerify />

      {/* Payment method selector */}
      <div className="card relative overflow-hidden">
        <div className="decor-sparkle" />
        <h3 className="mb-2 flex items-center gap-2 font-bold"><CreditCard size={16} /> Payment Method</h3>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button onClick={() => chooseMethod('upi')} disabled={savingMethod} className={`btn py-2.5 text-sm ${method === 'upi' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            <Smartphone size={15} /> UPI
          </button>
          <button onClick={() => chooseMethod('bank')} disabled={savingMethod} className={`btn py-2.5 text-sm ${method === 'bank' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            <Landmark size={15} /> Bank Account
          </button>
        </div>

        {method === 'upi' ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">UPI ID</span>
              {!editUpi ? (
                <button onClick={() => setEditUpi(true)} className="flex items-center gap-1 text-sm font-semibold text-brand-600"><Pencil size={14} /> Edit</button>
              ) : (
                <button onClick={saveUpi} className="flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check size={14} /> Save</button>
              )}
            </div>
            {editUpi ? (
              <input className="input" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="yourname@bank" />
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10">
                <Check size={16} /> {profile?.upi_id || 'Not set'}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Bank Account</span>
              {!editBank ? (
                <button onClick={() => setEditBank(true)} className="flex items-center gap-1 text-sm font-semibold text-brand-600"><Pencil size={14} /> Edit</button>
              ) : (
                <button onClick={saveBank} disabled={savingMethod} className="flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check size={14} /> Save</button>
              )}
            </div>
            {editBank ? (
              <div className="space-y-2">
                <input className="input" value={bank.account_holder_name} onChange={(e) => setBank((b) => ({ ...b, account_holder_name: e.target.value }))} placeholder="Account holder name" />
                <input className="input" value={bank.bank_account_number} onChange={(e) => setBank((b) => ({ ...b, bank_account_number: e.target.value.replace(/\D/g, '') }))} placeholder="Account number" inputMode="numeric" />
                <input className="input uppercase" value={bank.bank_ifsc} onChange={(e) => setBank((b) => ({ ...b, bank_ifsc: e.target.value.toUpperCase() }))} placeholder="IFSC code" />
              </div>
            ) : profile?.bank_account_number ? (
              <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10">
                <p className="flex items-center gap-2"><Check size={16} /> {profile.account_holder_name}</p>
                <p className="mt-1 font-mono text-xs">****{profile.bank_account_number.slice(-4)} · {profile.bank_ifsc}</p>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-600 dark:bg-amber-500/10">Add your bank account to receive payouts.</div>
            )}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="card space-y-2">
        <h3 className="flex items-center gap-2 font-bold"><Phone size={16} /> Verification Status</h3>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <span>Phone: {profile?.phone ? '+91 ' + profile.phone : '—'}</span>
          <span className={profile?.phone_verified ? 'font-semibold text-emerald-500' : 'text-rose-500'}>{profile?.phone_verified ? '✓ Verified' : 'Not verified'}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <span>{method === 'bank' ? 'Bank' : 'UPI'}: {method === 'bank' ? (profile?.bank_account_number ? '****' + profile.bank_account_number.slice(-4) : '—') : (profile?.upi_id || '—')}</span>
          <span className={(method === 'bank' ? profile?.bank_account_number : profile?.upi_id) ? 'font-semibold text-emerald-500' : 'text-rose-500'}>{(method === 'bank' ? profile?.bank_account_number : profile?.upi_id) ? '✓ Set' : 'Not set'}</span>
        </div>
      </div>

      {/* Withdraw */}
      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 font-bold"><ArrowDownToLine size={16} /> Request Withdrawal</h3>
        <div className="flex gap-2">
          <input type="number" className="input" placeholder={`Amount (min ${min})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button onClick={withdraw} disabled={busy || !amount} className="btn-primary px-6">{busy ? '…' : 'Withdraw'}</button>
        </div>
        {!profile?.phone_verified && <p className="mt-2 text-xs text-rose-500">Verify your WhatsApp number to withdraw.</p>}
      </div>

      {/* History */}
      <div>
        <h3 className="mb-2 font-bold">History</h3>
        {history.length === 0 ? (
          <div className="card text-center text-sm text-slate-400">No withdrawals yet</div>
        ) : (
          <div className="space-y-2">
            {history.map((w) => (
              <div key={w.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-bold">{rupee(w.amount)}</p>
                  <p className="text-xs text-slate-400">{formatDate(w.created_at)} · {w.upi_id}</p>
                </div>
                <span className={`badge px-2.5 py-1 capitalize ${['approved', 'completed'].includes(w.status) ? 'bg-emerald-50 text-emerald-600' : ['rejected', 'failed'].includes(w.status) ? 'bg-rose-50 text-rose-600' : w.status === 'processing' ? 'bg-sky-50 text-sky-600' : 'bg-amber-50 text-amber-600'}`}>{w.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
