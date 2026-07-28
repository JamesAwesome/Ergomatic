import { useEffect, useState } from 'react'

export interface Me {
  id: string
  email: string
  name: string
}

export type MeState = { state: 'loading' } | { state: 'out' } | { state: 'in'; user: Me }

export function useMe(): [MeState, () => void] {
  const [me, setMe] = useState<MeState>({ state: 'loading' })
  const signedOut = () => setMe({ state: 'out' })

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(async (res) => {
        if (cancelled) return
        if (res.ok) {
          const body = (await res.json()) as { user: Me }
          setMe({ state: 'in', user: body.user })
        } else {
          setMe({ state: 'out' })
        }
      })
      .catch(() => {
        if (!cancelled) setMe({ state: 'out' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return [me, signedOut]
}
