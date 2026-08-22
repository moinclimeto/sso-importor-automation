import React from 'react';

function dash(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function LetterHeader({ values }) {
  return (
    <header className="text-center">
      <p className="text-[18px] font-bold text-[#1a6b73] tracking-wide uppercase leading-snug">
        {dash(values.OrganizationName)}
      </p>
      <p className="mt-1.5 text-[12px] text-slate-600 leading-relaxed">
        {dash(values.OrganizationName)} <span className="text-slate-300 px-1">|</span> {dash(values.RegisteredAddress)}
      </p>
      <p className="mt-1 text-[11.5px] text-slate-500 leading-relaxed">
        CIN: {dash(values.CIN)}
        <span className="text-slate-300 px-1">|</span>
        GSTIN: {dash(values.GSTIN)}
        <span className="text-slate-300 px-1">|</span>
        PAN: {dash(values.CompanyPAN)}
        <span className="text-slate-300 px-1">|</span>
        IEC: {dash(values.IEC)}
      </p>
      <div className="mt-3 mb-5 h-[2.5px] bg-[#1a6b73] rounded-full" />
    </header>
  );
}

function SignatureBlock({ values, withSeal = false }) {
  return (
    <div className="mt-8">
      <p>For {dash(values.OrganizationName)}</p>
      <div className="h-14" />
      <p className="text-slate-500 italic">{withSeal ? '(Signature & Seal)' : '(Signature)'}</p>
      <p className="mt-3 font-semibold">{dash(values.AuthorizedPersonName)}</p>
      <p className="text-[13px]">{dash(values.Designation)}</p>
    </div>
  );
}

function CoveringLetter({ values }) {
  return (
    <>
      <LetterHeader values={values} />
      <div className="text-right text-[13px] leading-6 text-slate-700 mb-6">
        <p>Date: {dash(values.Date)}</p>
        <p>Ref: EPR/PIBO/IMP/{dash(values.ApplicationNo)}</p>
      </div>
      <div className="leading-6">
        <p>To,</p>
        <p className="font-bold">The Member Secretary</p>
        <p>Central Pollution Control Board (CPCB)</p>
        <p>Parivesh Bhawan, East Arjun Nagar</p>
        <p>Delhi – 110032</p>
      </div>
      <p className="mt-5 font-bold leading-6">
        Subject: Application for EPR Registration as an Importer (PIBO) under the Plastic Waste Management Rules, 2016 (as amended) — Application No. {dash(values.ApplicationNo)}
      </p>
      <p className="mt-5">Respected Sir/Madam,</p>
      <p className="mt-3 text-justify">
        We, <strong>{dash(values.OrganizationName)}</strong> (Trade Name: {dash(values.TradeName)}), a {dash(values.TypeOfCompany)} enterprise having our registered office at {dash(values.RegisteredAddress)}, are engaged in the import of plastic packaging / plastic-packaged commodities and are required to obtain registration under the Extended Producer Responsibility (EPR) framework of the Plastic Waste Management Rules, 2016 (as amended).
      </p>
      <p className="mt-3 text-justify">
        Accordingly, we hereby submit our application (Application No. {dash(values.ApplicationNo)}) for EPR Registration as an Importer through the CPCB Common EPR (CEPR) Portal for the registration year {dash(values.RegistrationYear)}. The requisite information has been furnished in Parts A, B and C of the application, and the supporting documents listed below are enclosed for your kind reference and processing.
      </p>
      <p className="mt-4 font-semibold">Enclosures:</p>
      <ol className="mt-1 ml-5 list-decimal space-y-0.5 text-justify">
        <li>Company PAN, GST Certificate and Unit GST Certificate (if applicable)</li>
        <li>CIN Certificate (if a company) / MSME (Udyam) Certificate or Large-Entity Declaration, as applicable</li>
        <li>Authorized Person&apos;s PAN</li>
        <li>Details (Type &amp; Quantity) of products produced/marketed</li>
        <li>Representative pictures of plastic packaging covering EPR categories</li>
        <li>Self-Declaration based upon Audited Statement</li>
        <li>Any other information/statutory document as required</li>
      </ol>
      <p className="mt-4 text-justify">
        We confirm that the information provided is true and correct to the best of our knowledge and belief. We request you to kindly process our application and grant the EPR Registration at the earliest.
      </p>
      <p className="mt-5">Thanking you,</p>
      <p>Yours faithfully,</p>
      <SignatureBlock values={values} />
      <p className="mt-3 text-[12.5px] text-slate-600">
        Mobile: {dash(values.Mobile)} <span className="text-slate-300 px-1">|</span> Email: {dash(values.Email)}
      </p>
    </>
  );
}

function SelfDeclaration({ values }) {
  return (
    <>
      <LetterHeader values={values} />
      <p className="text-right text-[13px] mb-6">Date: {dash(values.Date)}</p>
      <h3 className="text-center text-[15px] font-bold text-[#1a6b73] tracking-wide">SELF-DECLARATION</h3>
      <p className="text-center text-[13px] font-semibold text-[#1a6b73] mb-5">(Based upon Audited Financial Statements)</p>
      <p className="text-justify">
        I/We, <strong>{dash(values.AuthorizedPersonName)}</strong>, {dash(values.Designation)}, duly authorized signatory of <strong>{dash(values.OrganizationName)}</strong> (Trade Name: {dash(values.TradeName)}), having registered office at {dash(values.RegisteredAddress)}, GSTIN {dash(values.GSTIN)} and PAN {dash(values.CompanyPAN)}, do hereby solemnly declare and affirm as under:
      </p>
      <ol className="mt-3 ml-5 list-decimal space-y-2 text-justify">
        <li>
          That the details of plastic packaging imported, procured, sold and consumed, and the quantities (in Tonnes) furnished in our EPR application (Application No. {dash(values.ApplicationNo)}) for the year {dash(values.RegistrationYear)}, are true, correct and complete, and are based upon our audited financial statements and books of account for the relevant financial year(s).
        </li>
        <li>
          That the category-wise and transaction-wise data submitted under Part B of the application has been derived from genuine invoices / GST e-invoices and supporting records maintained in the ordinary course of business.
        </li>
        <li>
          That we have complied with the applicable provisions of the Plastic Waste Management Rules, 2016 (as amended) to the extent applicable to us.
        </li>
      </ol>
      <p className="mt-5 text-justify">
        Verified at {dash(values.Place)} on this {dash(values.Date)} that the contents of the above declaration are true and correct to the best of my/our knowledge and belief.
      </p>
      <SignatureBlock values={values} withSeal />
    </>
  );
}

function LargeEntityDeclaration({ values }) {
  return (
    <>
      <LetterHeader values={values} />
      <p className="text-right text-[13px] mb-6">Date: {dash(values.Date)}</p>
      <h3 className="text-center text-[15px] font-bold text-[#1a6b73] tracking-wide">DECLARATION OF ENTERPRISE CATEGORY</h3>
      <p className="text-center text-[13px] font-semibold text-[#1a6b73] mb-5">(Large Enterprise)</p>
      <p className="text-justify">
        I/We, <strong>{dash(values.AuthorizedPersonName)}</strong>, {dash(values.Designation)}, duly authorized signatory of <strong>{dash(values.OrganizationName)}</strong> (Trade Name: {dash(values.TradeName)}), having registered office at {dash(values.RegisteredAddress)}, GSTIN {dash(values.GSTIN)} and PAN {dash(values.CompanyPAN)}, do hereby declare and confirm as under:
      </p>
      <ol className="mt-3 ml-5 list-decimal space-y-2 text-justify">
        <li>
          That {dash(values.OrganizationName)} is classified as a LARGE ENTERPRISE, as its investment in plant &amp; machinery/equipment and/or annual turnover exceeds the thresholds prescribed for Micro, Small and Medium Enterprises under the Micro, Small and Medium Enterprises Development (MSMED) Act, 2006 (as amended).
        </li>
        <li>
          That, being a Large Enterprise, {dash(values.OrganizationName)} is not registered as an MSME and accordingly no MSME (Udyam) Registration Certificate is applicable to us. This declaration is submitted in lieu thereof for the purpose of establishing our company category in the EPR application (Application No. {dash(values.ApplicationNo)}).
        </li>
        <li>
          That the above position is based upon our audited financial statements for the relevant financial year and is true and correct.
        </li>
      </ol>
      <p className="mt-5">Verified at {dash(values.Place)} on this {dash(values.Date)}.</p>
      <SignatureBlock values={values} withSeal />
    </>
  );
}

export default function LetterPagePreview({ letterId, values = {} }) {
  return (
    <article
      className="mx-auto bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)] border border-slate-200"
      style={{
        width: 'min(100%, 794px)',
        minHeight: '1123px',
        padding: '56px 64px 64px',
        fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
        fontSize: '14px',
        lineHeight: '1.55',
        color: '#1e293b',
      }}
    >
      {letterId === 'selfDeclaration' && <SelfDeclaration values={values} />}
      {letterId === 'largeEntity' && <LargeEntityDeclaration values={values} />}
      {letterId !== 'selfDeclaration' && letterId !== 'largeEntity' && <CoveringLetter values={values} />}
    </article>
  );
}
