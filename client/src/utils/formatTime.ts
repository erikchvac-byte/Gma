import { parseTimeToMinutes } from './dealTime'

export function formatLastUpdated(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// '21:00' → '9:00 PM', '00:00' → '12:00 AM', '12:00' → '12:00 PM'; invalid → null
export function formatTimeOfDay(time: string): string | null {
  const totalMinutes = parseTimeToMinutes(time)
  if (Number.isNaN(totalMinutes)) {
    return null
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const period = hours < 12 ? 'AM' : 'PM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`
}

// 30 → '0:30', 185 → '3:05'; negative or NaN → null
export function formatCountdown(minutes: number): string | null {
  if (Number.isNaN(minutes) || minutes < 0) {
    return null
  }
  const whole = Math.floor(minutes)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
