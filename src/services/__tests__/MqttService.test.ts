import { describe, expect, it } from 'vitest';
import { defaultBrokerUrl } from '../MqttService';

describe('defaultBrokerUrl', () => {
  it('uses the same-origin nginx websocket route', () => {
    expect(defaultBrokerUrl()).toBe('ws://localhost:3000/mqtt');
  });
});
