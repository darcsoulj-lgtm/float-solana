# Navigation consolidation

The sidebar now has News, Markets, Discussions, and Profile.

Markets retains the private portfolio summary and circle, followed by Solana-wide metrics and one searchable table. Issuer cards filter the table. Only my holdings narrows the table without narrowing the aggregate metric inputs. Wallet-relevant data batches load first, followed by the remaining registry in bounded parallel requests. Existing market refresh intervals and source labels are retained. Held stocks have a compact Held label.

News includes an independent Upcoming section. It previews two events and expands into a date-grouped agenda with twenty-event pagination. The holding filter controls both headlines and the agenda. Headline errors do not hide events; event errors have an explicit retry state. Date-only events retain their calendar date, while timed events are grouped in the viewer's timezone. Links remain specific source announcements.

Legacy ?view=calendar links open News with the agenda expanded. The normalized route is ?view=brief&agenda=open. Collapse resets event pagination. Changing stock filters hides stale events while the next request loads.

Validation: 171 automated tests passed, including market filtering without losing aggregate metrics, Calendar link handling, two-event preview and expansion, filter changes, pagination availability, and independent event/headline failure handling. Type checking and production build passed. Browser automation remains administratively blocked; rendered component tests are not a substitute for authenticated browser visual QA.
