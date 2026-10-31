/**
 * The ids this plugin registers with the Host's page.
 *
 * `TAB_KIND` names the tab in the right-hand strip; `HOME_ID` names the main
 * page slot. Both are read by the entry that registers them and by the code
 * that opens the panel, so they live together rather than in each caller.
 */
export const TAB_KIND = 'blueprint';
export const HOME_ID = 'blueprint-home';
