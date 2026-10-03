// Market configuration. Add another market by adding an entry and its data files; nothing else is hard-coded.
const enc = encodeURIComponent;
const digits = s => String(s || '').replace(/\D/g, '');
export const MARKETS = {
  chicagoland: {
    id: 'chicagoland', name: 'Chicagoland Industrial', center: [41.88, -87.85], zoom: 9,
    dataFiles: ['cook', 'dupage', 'lake', 'mchenry', 'kane', 'will'],
    sos: { name: 'IL Secretary of State business search', url: () => 'https://apps.ilsos.gov/businessentitysearch/' },
    counties: {
      Cook: {
        source: 'Cook County Assessor (open data)',
        assessor: p => `https://www.cookcountyassessoril.gov/pin/${digits(p.pin)}`,
        treasurer: p => `https://www.cookcountypropertyinfo.com/pinresults.aspx?pin=${digits(p.pin)}`,
        recorder: () => 'https://crs.cookcountyclerkil.gov/Search',
        gis: p => `https://maps.cookcountyil.gov/cookviewer/?search=${digits(p.pin)}`,
      },
      DuPage: {
        source: 'DuPage County GIS (ParcelsWithRealEstateCC)',
        assessor: () => 'https://propertylookup.dupagecounty.gov/',
        treasurer: () => 'https://propertylookup.dupagecounty.gov/',
        recorder: () => 'https://www.dupagecounty.gov/elected_officials/recorder/',
        gis: () => 'https://gis.dupageco.org/parcelviewer/',
      },
      Lake: {
        source: 'Lake County GIS (Tax Parcel Information)',
        assessor: () => 'https://tax.lakecountyil.gov/search/commonsearch.aspx?mode=realprop',
        treasurer: () => 'https://www.lakecountyil.gov/508/Current-Payment-Status',
        recorder: () => 'https://www.lakecountyil.gov/2385/Recorder-of-Deeds',
        gis: () => 'https://maps.lakecountyil.gov/mapsonline/',
      },
      McHenry: {
        source: 'McHenry County GIS (TaxParcels)',
        assessor: () => 'https://www.mchenrycountygis.org/Athena/',
        treasurer: p => `https://mchenryil.devnetwedge.com/parcel/view/${digits(p.pin)}/${new Date().getFullYear() - 1}`,
        recorder: () => 'https://rep4laredo.fidlar.com/ILMcHenry/AvaWeb/',
        gis: () => 'https://www.mchenrycountygis.org/Athena/',
      },
      Kane: {
        source: 'Kane County GIS (KanePINList)',
        assessor: () => 'https://www.kanecountyassessments.org/',
        treasurer: () => 'https://www.kanecountytreasurer.org/',
        recorder: () => 'https://www.kanecountyrecorder.net/',
        gis: () => 'https://gistech.countyofkane.org/gisims/kanemap/kanegis4.html',
      },
      Will: {
        source: 'IL Dept of Revenue PTAX-203 sales + Will County GIS',
        assessor: () => 'https://www.willcountysoa.com/',
        treasurer: () => 'https://www.willcountytreasurer.com/',
        recorder: () => 'https://www.willcountyrecorder.org/',
        gis: () => 'https://gis.willcountyillinois.com/portal/apps/webappviewer/index.html',
      },
    },
    // Lead time before lease expiration to start outreach (months), by building size
    leaseLeadMonths: sf => (sf >= 100000 ? 24 : sf >= 20000 ? 15 : 9),
  },
};
export const MARKET = MARKETS.chicagoland;

// One-click research links (all plain public search URLs, nothing automated)
export function propertyLinks(p, owner) {
  const addr = [p.address, p.city, 'IL', p.zip].filter(Boolean).join(' ');
  const g = q => `https://www.google.com/search?q=${enc(q)}`;
  const c = MARKET.counties[p.county] || {};
  const own = (owner && owner.name) || p.taxpayer || '';
  const L = [
    ['Google', g(`"${p.address}" ${p.city || ''} IL`)],
    ['Google Maps', `https://www.google.com/maps/search/?api=1&query=${enc(addr || (p.lat + ',' + p.lon))}`],
    ['Street View', `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}`],
    ['Owner / entity', own ? g(`"${own}"`) : null],
    ['Owner + Illinois', own ? g(`"${own}" Illinois owner OR manager OR president`) : null],
    ['County assessor', c.assessor ? c.assessor(p) : null],
    ['Treasurer / taxes', c.treasurer ? c.treasurer(p) : null],
    ['Recorder of deeds', c.recorder ? c.recorder(p) : null],
    ['County GIS', c.gis ? c.gis(p) : null],
    ['News', `https://news.google.com/search?q=${enc(`"${p.address}" ${p.city || ''}`)}`],
    ['"For sale"', g(`"${p.address}" ${p.city || ''} "for sale"`)],
    ['"For lease"', g(`"${p.address}" ${p.city || ''} "for lease"`)],
    ['Permits', g(`"${p.address}" ${p.city || ''} permit`)],
    ['Zoning', g(`${p.city || p.municipality || ''} IL zoning map ${p.address || ''}`)],
    [MARKET.sos.name, MARKET.sos.url()],
  ];
  return L.filter(x => x[1]);
}
export function companyLinks(co) {
  const n = co.name || '';
  const g = q => `https://www.google.com/search?q=${enc(q)}`;
  return [
    ['Google', g(`"${n}"`)],
    ['Website', g(`"${n}" official site`)],
    ['News', `https://news.google.com/search?q=${enc(`"${n}"`)}`],
    ['Expansion news', g(`"${n}" expansion OR "new facility" OR relocation OR warehouse`)],
    ['Hiring', g(`"${n}" jobs warehouse OR manufacturing OR logistics Illinois`)],
    ['LinkedIn (via Google)', g(`site:linkedin.com/company "${n}"`)],
    ['Funding / M&A', g(`"${n}" acquisition OR funding OR "private equity"`)],
    ['Federal contracts (USAspending)', g(`site:usaspending.gov "${n}"`)], ['SAM.gov registration', `https://sam.gov/search/?index=ei&keywords=${enc(n)}`], ['WARN layoff notices (IL)', g(`"${n}" WARN notice Illinois`)],
    [MARKET.sos.name, MARKET.sos.url()],
  ];
}
