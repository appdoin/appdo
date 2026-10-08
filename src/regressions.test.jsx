import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from './context/AuthContext'
import Wallet from './pages/user/Wallet'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  profileRead: vi.fn(),
  rpc: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  callbackActive: false,
  readsInsideCallback: 0,
  profile: {
    id: '10000000-0000-0000-0000-000000000001',
    full_name: 'Wallet regression',
    wallet_balance: 100,
    total_earned: 100,
    phone_verified: true,
    payout_method: 'upi',
    upi_id: 'saved@bank',
  },
}))

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: mocks.profile.id } } } }),
      onAuthStateChange: callback => {
        queueMicrotask(() => {
          mocks.callbackActive = true
          try {
            callback('INITIAL_SESSION', { user: { id: mocks.profile.id } })
          } finally {
            mocks.callbackActive = false
          }
        })
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
    from: table => {
      if (table === 'profiles') return {
        select: () => {
          if (mocks.callbackActive) mocks.readsInsideCallback += 1
          mocks.profileRead()
          return { eq: () => ({ single: async () => ({ data: mocks.profile }) }) }
        },
        update: values => ({ eq: () => mocks.update(values) }),
      }
      if (table === 'withdrawals') return {
        select: () => ({ order: async () => ({ data: [] }) }),
      }
      if (table === 'settings') return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { value: '10' } }) }) }),
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    rpc: (...argumentsList) => mocks.rpc(...argumentsList),
  },
}))

vi.mock('./lib/fingerprint', () => ({
  generateFingerprint: async () => 'test-fingerprint',
  generateHardwareId: async () => 'test-hardware',
  getDeviceMetadata: () => ({}),
}))
vi.mock('./components/PhoneVerify', () => ({ default: () => null }))
vi.mock('./components/Toast', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', window.localStorage)
  vi.stubGlobal('sessionStorage', window.sessionStorage)
  localStorage.clear()
  mocks.callbackActive = false
  mocks.readsInsideCallback = 0
  mocks.profile.phone_verified = true
  mocks.rpc.mockResolvedValue({ data: null, error: null })
  mocks.update.mockResolvedValue({ error: { message: 'Wallet save rejected' } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderWallet() {
  render(<AuthProvider><Wallet /></AuthProvider>)
  await screen.findByText('saved@bank')
}

describe('Auth and wallet regressions', () => {
  it('loads profiles outside the Supabase auth callback', async () => {
    await renderWallet()
    expect(mocks.profileRead).toHaveBeenCalled()
    expect(mocks.readsInsideCallback).toBe(0)
  })

  it('keeps the saved payment method when a change fails', async () => {
    await renderWallet()
    fireEvent.click(screen.getByRole('button', { name: 'Bank Account' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Wallet save rejected'))
    expect(screen.getByText('UPI ID')).toBeTruthy()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('keeps the UPI editor open and reports failed saves', async () => {
    await renderWallet()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByPlaceholderText('yourname@bank'), { target: { value: 'new@bank' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Wallet save rejected'))
    expect(screen.getByPlaceholderText('yourname@bank').value).toBe('new@bank')
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('blocks withdrawal while payment details are saving', async () => {
    mocks.update.mockImplementation(() => new Promise(() => {}))
    await renderWallet()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bank Account' }))
    expect(screen.getByRole('button', { name: 'Withdraw' }).disabled).toBe(true)
  })

  it('reports a structured OTP rejection without a success toast', async () => {
    const { default: PhoneVerify } = await vi.importActual('./components/PhoneVerify')
    mocks.profile.phone_verified = false
    mocks.rpc.mockImplementation(async name => ({
      data: name === 'request_phone_otp_v2' ? { code: '123456' } : { verified: false, error: 'INVALID_CODE' },
      error: null,
    }))
    render(<AuthProvider><PhoneVerify /></AuthProvider>)
    await waitFor(() => expect(mocks.profileRead).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('10-digit phone number'), { target: { value: '9876543210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Get Verification Code' }))
    await screen.findByPlaceholderText('Enter code here')
    mocks.success.mockClear()
    fireEvent.change(screen.getByPlaceholderText('Enter code here'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /Verify$/ }))
    expect(await screen.findByText('Incorrect code. Try again.')).toBeTruthy()
    expect(mocks.rpc).toHaveBeenCalledWith('verify_phone_otp_v2', { p_code: '000000' })
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('accepts a successful structured OTP verification', async () => {
    const { default: PhoneVerify } = await vi.importActual('./components/PhoneVerify')
    mocks.profile.phone_verified = false
    mocks.rpc.mockImplementation(async name => ({
      data: name === 'request_phone_otp_v2' ? { code: '123456' } : { verified: true },
      error: null,
    }))
    render(<AuthProvider><PhoneVerify /></AuthProvider>)
    await waitFor(() => expect(mocks.profileRead).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('10-digit phone number'), { target: { value: '9876543210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Get Verification Code' }))
    fireEvent.change(await screen.findByPlaceholderText('Enter code here'), { target: { value: '123456' } })
    mocks.success.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Verify$/ }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('Phone verified!')))
    expect(mocks.error).not.toHaveBeenCalled()
  })
})