export type TitleGeneratorModel = {
  key: string;
  label: string;
};

export type TitleGeneratorState = {
  modelSetting: string;
  models: TitleGeneratorModel[];
};
