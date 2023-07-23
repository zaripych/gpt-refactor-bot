#!/usr/bin/env tsx
import { bootstrap } from '../src/bootstrap';

await bootstrap(() => import('../src/refactorBot'));
