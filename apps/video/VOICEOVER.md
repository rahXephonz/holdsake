# Demo voiceover

Script for the `Demo` composition (85 s). Read it over the rendered video with the sound off, one
take, at a calm pace (about 2.3 words a second). Each block has to fit its time.

| Time        | On screen            | Say                                                                                                                                                |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 – 0:04 | Logo                 | This is Holdsake. Give real stocks, not gift cards.                                                                                                |
| 0:04 – 0:16 | 1 · Send a gift      | Ry wants to send Rahx a New Year gift. Pick who it's for, then what to give: up to three real stocks, plus cash.                                   |
| 0:16 – 0:26 | Card, note, review   | Wrap it in a card, add a note, and check the review. The fee is the network cost, shown up front.                                                  |
| 0:26 – 0:33 | Sending, sent        | One tap sends it. Nothing to approve, nothing to top up. Only Rahx can open it.                                                                    |
| 0:33 – 0:42 | 2 · Open it          | Rahx opens Holdsake and the gift is already waiting: the card, the note, and exactly what's inside.                                                |
| 0:42 – 0:50 | Opening, it's theirs | One tap, and the shares are theirs. Apple and Circle, in their own account.                                                                        |
| 0:50 – 0:58 | 3 · Grow a fund      | Holdsake also does goal funds: shares for someone, locked until a date. Anyone can add cash.                                                       |
| 0:58 – 1:10 | Buying, receipt      | The cash buys the fund's mix, Broadcom, Marvell and NVIDIA, in one go. It stays locked until October 2026, and only Ry can take it out.            |
| 1:10 – 1:20 | Under the hood       | Under the hood, it's live on Robinhood Chain mainnet: our own escrow contracts, and EIP-7702 with our paymaster, so nobody ever needs to hold ETH. |
| 1:20 – 1:25 | Outro                | Holdsake. Give real ownership. Try it at holdsake dot vercel dot app.                                                                              |

## Adding it

1. Record with Voice Memos or QuickTime (File → New Audio Recording), in a quiet room, phone or
   mic about a hand's width away.
2. Save it as `public/demo/voice.m4a` (or `.wav`/`.mp3`), starting at 0:00 of the video.
3. `pnpm --filter @holdsake/video render:demo`. The music drops under the voice on its own.

The recordings come from `/hackathon` through `pnpm --filter @holdsake/video clips`.
