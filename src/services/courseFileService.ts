import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { trainingDir } from '../config.js';
import type { StaticCoachFiles } from '../types/coach.js';

export async function readCourseSchema(): Promise<string> {
  return readTrainingFile('cource-echema-optimized.md');
}

export async function readLevelInputs(level: number): Promise<string> {
  if (!(await levelInputsExist(level))) {
    throw new Error(`No input file found for level ${level}.`);
  }

  return readTrainingFile(`inputs-level${level}.md`);
}

export async function readStaticCoachFiles(level: number, stateMarkdown: string): Promise<StaticCoachFiles> {
  const [courseSchema, levelInputs] = await Promise.all([
    readCourseSchema(),
    readLevelInputs(level)
  ]);

  return { courseSchema, levelInputs, stateMarkdown };
}

export async function levelInputsExist(level: number): Promise<boolean> {
  if (level < 1) {
    return false;
  }

  try {
    await access(getTrainingPath(`inputs-level${level}.md`), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function readTrainingFile(fileName: string): Promise<string> {
  return readFile(getTrainingPath(fileName), 'utf8');
}

function getTrainingPath(fileName: string): string {
  return path.join(trainingDir, fileName);
}
