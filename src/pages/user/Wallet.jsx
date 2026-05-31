import { useEffect, useState } from 'react'
import { CreditCard, Phone, Pencil, Check, ArrowDownToLine } from 'lucide-react'
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

  useEffect(() => {
    setUpi(profile?.upi_id || '')
  }, [profile?.upi_id])

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

  const withdraw = async () => {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('request_withdrawal', { p_amount: Number(amount), p_upi: upi || null })
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
    <div className="space-y-4">
      {/* Balance */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 p-4 text-white shadow-md animate-slide-up">
        <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/10 blur-xl animate-pulse-soft" />
        <div className="absolute -bottom-6 left-8 h-12 w-12 rounded-full bg-white/5 blur-xl" />
        <div className="decor-leaf leaf-1" style={{ opacity: 0.2 }} />
        <p className="relative flex items-center gap-1.5 text-xs text-white/80"><CreditCard size={13} /> Available Balance</p>
        <p className="relative mt-1 text-2xl font-extrabold">{rupee(profile?.wallet_balance)}</p>
      </div>

      {/* WhatsApp verification */}
      <PhoneVerify />

      {/* UPI ID */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold"><CreditCard size={16} /> UPI ID</h3>
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

      {/* Status */}
      <div className="card space-y-2">
        <h3 className="flex items-center gap-2 font-bold"><Phone size={16} /> Phone & UPI Status</h3>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <span>Phone: {profile?.phone ? '+91 ' + profile.phone : '—'}</span>
          <span className={profile?.phone_verified ? 'font-semibold text-emerald-500' : 'text-rose-500'}>{profile?.phone_verified ? '✓ Verified' : 'Not verified'}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
          <span>UPI: {profile?.upi_id || '—'}</span>
          <span className={profile?.upi_id ? 'font-semibold text-emerald-500' : 'text-rose-500'}>{profile?.upi_id ? '✓ Set' : 'Not set'}</span>
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
