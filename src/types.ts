export interface EpgChannel {
  id: string;
  name: string;
  icon?: string;
}

export interface EpgProgramme {
  channelId: string;
  start: Date;
  stop: Date;
  title: string;
  subTitle?: string;
  description?: string;
  category?: string;
  icon?: string;
}

export interface SourceResult {
  channels: EpgChannel[];
  programmes: EpgProgramme[];
  warnings: string[];
}

export interface EpgSource {
  readonly id: string;
  readonly name: string;
  fetch(): Promise<SourceResult>;
}
