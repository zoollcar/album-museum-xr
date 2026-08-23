import { describe, expect, it, vi } from 'vitest';
import { BackgroundMusicManager, DEFAULT_VOLUME, backgroundMusicForRoom } from '../src/museum/background-music.js';
import { museumConfig, room } from './fixtures.js';

function fakeAudio() {
  return {
    paused: true,
    pause: vi.fn(function pause() { this.paused = true; }),
    play: vi.fn(function play() { this.paused = false; return Promise.resolve(); }),
    load: vi.fn(),
    removeAttribute: vi.fn()
  };
}

describe('background music', () => {
  it('uses room music before the museum default', () => {
    const global = { url: 'https://media.example.com/global.mp3' };
    const unique = { url: 'https://media.example.com/unique.mp3', volume: 0.2 };
    const config = museumConfig({
      museum: { title: 'Test Museum', backgroundMusic: global, lobby: { id: 'lobby', template: 'lobby-atrium' } },
      rooms: [{ ...room('room-a'), backgroundMusic: unique }]
    });

    expect(backgroundMusicForRoom(config, 'lobby')).toBe(global);
    expect(backgroundMusicForRoom(config, 'room-a')).toBe(unique);
  });

  it('loops tracks, applies default volume, and stops when cleared', async () => {
    const audio = fakeAudio();
    const manager = new BackgroundMusicManager({ audioFactory: () => audio, unlockTargets: [] });
    manager.setTrack({ url: 'https://media.example.com/global.mp3' });
    await Promise.resolve();

    expect(audio.loop).toBe(true);
    expect(audio.src).toBe('https://media.example.com/global.mp3');
    expect(audio.volume).toBe(DEFAULT_VOLUME);
    expect(audio.play).toHaveBeenCalledOnce();

    manager.setTrack(null);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('retries autoplay after a user gesture', async () => {
    const audio = fakeAudio();
    audio.play
      .mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
      .mockResolvedValueOnce();
    const target = new EventTarget();
    const manager = new BackgroundMusicManager({ audioFactory: () => audio, unlockTargets: [target] });
    manager.setTrack({ url: 'https://media.example.com/global.mp3' });
    await Promise.resolve();
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();

    expect(audio.play).toHaveBeenCalledTimes(2);
    manager.dispose();
  });
});
