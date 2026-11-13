import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the viewer into ONE html file (JS, CSS and fonts inlined) so a
// stamped plan opens offline straight from disk.
export default defineConfig({
  root: 'src/viewer',
  plugins: [viteSingleFile()],
  build: {
    outDir: '../../plugin/skills/feature-plan/dist',
    emptyOutDir: true,
  },
});
