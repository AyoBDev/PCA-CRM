// Offer channel registry.
//
// A channel is { name, isConfigured(): boolean, send(offer, context) }. Adding
// SMS later means writing smsChannel.js against that contract and listing it
// here — the offer engine itself does not change.
//
// Channels are ordered by immediacy: portal first (always available, updates
// the caregiver's app in realtime), then email.

const portalChannel = require('./portalChannel');
const emailChannel = require('./emailChannel');

const ALL_CHANNELS = [portalChannel, emailChannel];

function resolveChannels() {
    return ALL_CHANNELS.filter(c => c.isConfigured());
}

/**
 * Deliver an offer over every configured channel.
 *
 * Never throws. A caregiver with a dead mailbox must not abort a replacement
 * workflow that still has candidates to try, so failures are reported per
 * channel and the caller decides what to do with them.
 *
 * @returns {Promise<{delivered: string[], failed: {channel: string, error: string}[], anyDelivered: boolean}>}
 */
async function sendOffer(offer, context) {
    const delivered = [];
    const failed = [];

    for (const channel of resolveChannels()) {
        try {
            await channel.send(offer, context);
            delivered.push(channel.name);
        } catch (err) {
            failed.push({ channel: channel.name, error: err.message });
        }
    }

    return { delivered, failed, anyDelivered: delivered.length > 0 };
}

module.exports = { resolveChannels, sendOffer, ALL_CHANNELS };
