import { describe, expect, it, vi } from 'vitest'
import { ResourceTracker } from '../resources'

describe('ResourceTracker', () => {
  it('disposes tracked resources once and clears itself', () => {
    const tracker = new ResourceTracker()
    const resource = { dispose: vi.fn() }

    tracker.track(resource)
    tracker.track(resource)
    expect(tracker.size).toBe(1)

    tracker.dispose()
    tracker.dispose()
    expect(resource.dispose).toHaveBeenCalledTimes(1)
    expect(tracker.size).toBe(0)
  })
})
