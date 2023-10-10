#!/usr/bin/env tsx
import { bootstrap } from './bootstrap';

await bootstrap(() => import('./refactorBot'));
