export const coachModels = [
  { id: 'gpt-5.6-luna', label: 'Luna' },
  { id: 'gpt-5.6-terra', label: 'Terra' },
  { id: 'gpt-5.6-sol', label: 'Sol' },
  { id: 'gpt-6-astra', label: 'Astra' }
] as const;

export type CoachModel = typeof coachModels[number]['id'];
export const defaultCoachModel: CoachModel = coachModels[0].id;
export const isCoachModel = (value: unknown): value is CoachModel => coachModels.some(model => model.id === value);
export const coachModelLabel = (value: CoachModel) => coachModels.find(model => model.id === value)!.label;
export const nextCoachModel = (value: CoachModel): CoachModel => coachModels[(coachModels.findIndex(model => model.id === value) + 1) % coachModels.length].id;
