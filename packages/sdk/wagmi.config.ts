import { defineConfig } from '@wagmi/cli'
import { foundry } from '@wagmi/cli/plugins'

// ABIs come from contracts/out. moon builds the contracts first (sdk:generate deps on
// contracts:build), so the plugin doesn't run forge itself.
export default defineConfig({
  out: 'src/generated/abis.ts',
  plugins: [
    foundry({
      project: '../../contracts',
      include: ['Holdsake*.sol/**'],
      forge: { build: false },
    }),
  ],
})
