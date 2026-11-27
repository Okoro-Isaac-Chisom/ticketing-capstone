import { defineApiTests } from './apiSuite.js';
import { createMemoryRepository } from '../src/repositories/memory.js';

defineApiTests('API with the in-memory repository', createMemoryRepository);
