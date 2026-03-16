/**
 * Standard residential cleaning checklist for Calgary.
 * Used as a reference baseline for the AI estimator — the AI customizes
 * these tasks per room based on uploaded photos.
 */

export type Priority = 'high' | 'medium' | 'standard';
export type CleaningTypeKey = 'standard' | 'deep' | 'moveout';

export interface ChecklistItem {
  task: string;
  priority: Priority;
  /** Which cleaning types include this task by default */
  includedIn: CleaningTypeKey[];
}

export interface RoomChecklistDef {
  room: string;
  items: ChecklistItem[];
}

export const CLEANING_CHECKLIST: RoomChecklistDef[] = [
  {
    room: 'Kitchen',
    items: [
      { task: 'Clean and disinfect countertops',              priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean stovetop burners and drip pans',         priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Degrease range hood and filter',               priority: 'high',     includedIn: ['deep', 'moveout'] },
      { task: 'Clean oven exterior',                          priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean oven interior',                          priority: 'high',     includedIn: ['deep', 'moveout'] },
      { task: 'Clean microwave inside and outside',           priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe refrigerator exterior',                   priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean refrigerator interior and shelves',      priority: 'high',     includedIn: ['deep', 'moveout'] },
      { task: 'Wipe cabinet fronts and handles',              priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean inside cabinets and drawers',            priority: 'medium',   includedIn: ['moveout'] },
      { task: 'Clean and disinfect sink and faucet',          priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe backsplash',                              priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe small appliances (toaster, kettle, etc.)',priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean dishwasher exterior',                    priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Empty and clean trash bin',                    priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Sweep and mop floor',                          priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
    ],
  },
  {
    room: 'Bathroom',
    items: [
      { task: 'Scrub and disinfect toilet (bowl, seat, exterior)', priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Scrub shower and/or bathtub',                       priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Remove soap scum from shower and tub',              priority: 'high',     includedIn: ['deep', 'moveout'] },
      { task: 'Clean glass shower door',                           priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Scrub tile grout lines',                            priority: 'high',     includedIn: ['deep', 'moveout'] },
      { task: 'Clean and disinfect sink and faucet',               priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe vanity countertop',                            priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean mirrors',                                     priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe cabinet fronts',                               priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean inside cabinets',                             priority: 'medium',   includedIn: ['moveout'] },
      { task: 'Clean exhaust fan cover',                           priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Wipe towel bars and toilet paper holder',           priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Empty and clean trash bin',                         priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Sweep and mop floor',                               priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
    ],
  },
  {
    room: 'Bedroom',
    items: [
      { task: 'Dust all surfaces (nightstands, dressers, shelves)', priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe furniture exteriors',                           priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean inside closets and wardrobes',                 priority: 'medium',   includedIn: ['moveout'] },
      { task: 'Vacuum carpet or sweep/mop hard floors',             priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Vacuum under bed and furniture',                     priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Wipe windowsills and window tracks',                 priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe light switches and door handles',               priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Dust ceiling fan blades',                            priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Clean mirrors',                                      priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
    ],
  },
  {
    room: 'Living Room',
    items: [
      { task: 'Dust all surfaces (shelves, TV stand, coffee table)', priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Vacuum sofa and upholstered furniture',               priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Dust blinds or wipe window coverings',                priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Wipe windowsills and window tracks',                  priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Vacuum carpet or sweep/mop hard floors',              priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Vacuum under furniture',                              priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Dust ceiling fan blades and light fixtures',          priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Wipe light switches and door handles',                priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean TV screen and electronics exteriors',           priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Clean mirrors and glass surfaces',                    priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
    ],
  },
  {
    room: 'Basement',
    items: [
      { task: 'Sweep and vacuum all floors',                priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Mop hard floors',                            priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Dust surfaces and shelves',                  priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Remove cobwebs from ceiling and corners',    priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe down storage shelving',                 priority: 'standard', includedIn: ['deep', 'moveout'] },
      { task: 'Clean utility sink if present',              priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Wipe window wells and sills',                priority: 'standard', includedIn: ['deep', 'moveout'] },
    ],
  },
  {
    room: 'Garage',
    items: [
      { task: 'Sweep garage floor',                         priority: 'high',     includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Remove cobwebs from ceiling and walls',      priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe counters and workbench surfaces',       priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Organize shelving and storage',              priority: 'standard', includedIn: ['deep', 'moveout'] },
    ],
  },
  {
    room: 'Throughout',
    items: [
      { task: 'Remove cobwebs from all rooms',              priority: 'medium',   includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Dust baseboards throughout',                 priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Wipe all light switches and outlet covers',  priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Wipe all interior door handles',             priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
      { task: 'Dust ceiling fans and light fixtures',       priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Clean interior windows',                     priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Clean interior walls (scuff marks)',         priority: 'medium',   includedIn: ['deep', 'moveout'] },
      { task: 'Empty all trash bins',                       priority: 'standard', includedIn: ['standard', 'deep', 'moveout'] },
    ],
  },
];
