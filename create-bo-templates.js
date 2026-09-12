import fs from 'fs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import path from 'path';

function buildParagraphs(text) {
  return text.split('\n').map((line) => {
    return new Paragraph({
      children: [
        new TextRun({
          text: line,
          font: 'Times New Roman',
          size: 24, // 12pt
        }),
      ],
      spacing: { after: 120 },
    });
  });
}

const coverLetterText = `[ COMPANY LETTERHEAD ]
{{OrganizationName}}
(Trading as: {{TradeName}})
{{RegisteredAddress}}

Ref. No.: {{ApplicationNo}}\tDate: {{Date}}

To,
The Competent Authority,
Central Pollution Control Board,
(Centralised EPR Portal for Plastic Packaging)
Submitted via CPCB Centralised EPR Portal

Subject: Submission of application for registration as Brand Owner (BO) under the Extended Producer Responsibility (EPR) framework of the Plastic Waste Management Rules, 2016 (as amended) — request for approval.

Respected Sir / Madam,

We, {{OrganizationName}}, have applied for registration as a Brand Owner under the EPR provisions of the Plastic Waste Management Rules, 2016 (as amended) on the CPCB Centralised EPR Portal for Plastic Packaging. All required information and supporting documents have been furnished on the portal to the best possible accuracy, based on our audited records, statutory filings and available operational data.

The salient details of our application are summarised below for your ready reference:
• Legal Name of the Entity: {{OrganizationName}}
• Trade Name: {{TradeName}}
• Category of Applicant: Brand Owner (BO)
• Company PAN: {{CompanyPAN}}
• GSTIN: {{GSTIN}}
• CIN: {{CIN}}
• Registered Address: {{RegisteredAddress}}
• Authorised Person (Name / Designation / Mobile / Email): {{AuthorizedPersonName}} / {{Designation}} / {{Mobile}} / {{Email}}
• State(s) / UT(s) of Operation: {{Place}}
• Total Plastic Packaging Consumed (TPA): ________

We confirm that the information submitted is true, correct and complete to the best of our knowledge and belief; that the plastic packaging quantities declared are supported by our audited financial statements and invoice/transactional records; and that we undertake to fulfil all applicable EPR obligations, recycling targets and reporting requirements prescribed under the said Rules.

In view of the above, we respectfully request you to kindly review and approve our Brand Owner registration application at the earliest and issue the EPR Registration Certificate. We shall be glad to furnish any additional information, clarification or document that may be required.

Thanking you,
Yours faithfully,
For {{OrganizationName}}

__________________________
({{AuthorizedPersonName}})
{{Designation}}
Mobile: {{Mobile}}    Email: {{Email}}
Seal:

Enclosures:
1. Company PAN card
2. GST registration certificate(s)
3. CIN / Certificate of Incorporation
4. Udyam / MSME certificate or Large-entity declaration
5. Valid Air & Water Act consents (if applicable)
6. Representative photograph(s) of plastic packaging
7. Self-declaration based on audited statement
8. Any other document (if applicable): ________`;

const selfDeclarationText = `[ COMPANY LETTERHEAD ]
{{OrganizationName}}
(Trading as: {{TradeName}})
{{RegisteredAddress}}

Ref. No.: {{ApplicationNo}}\tDate: {{Date}}

To,
The Competent Authority,
Central Pollution Control Board,
(Centralised EPR Portal for Plastic Packaging)
Submitted via CPCB Centralised EPR Portal

Subject: Self-declaration and clarification of the information, calculations and methodologies adopted in our application for registration as a Brand Owner (BO) under the Extended Producer Responsibility (EPR) framework of the Plastic Waste Management Rules, 2016 (as amended).

Respected Sir / Madam,

We, {{OrganizationName}}, have applied for registration as a Brand Owner under the EPR provisions of the Plastic Waste Management Rules, 2016 (as amended) on the CPCB Centralised EPR Portal for Plastic Packaging. We confirm that the application has been completed in accordance with the prescribed structure and that the information sought has been furnished to the best of our knowledge and belief, based on our audited statements, statutory filings and available operational records.

In the course of completing the application, certain particulars have been derived using specific calculations, methodologies or reasonable assumptions. For your better reference and understanding, and in the interest of full transparency, we set out below the relevant clarifications / self-declarations:

Declaration 1 — [Particular / information being clarified]: [Explanation of the calculation, methodology or assumption adopted, and the basis on which the said figure / information has been declared.]

Declaration 2 — [Particular / information being clarified]: [Explanation of the calculation, methodology or assumption adopted, and the basis on which the said figure / information has been declared.]

Declaration 3 — [Particular / information being clarified]: [Explanation of the calculation, methodology or assumption adopted, and the basis on which the said figure / information has been declared.]

Declaration 4 — [Particular / information being clarified]: [Explanation of the calculation, methodology or assumption adopted, and the basis on which the said figure / information has been declared.]

The above clarifications are furnished in good faith and are true and correct to the best of our knowledge and belief, and are consistent with our audited statements and records. We undertake to furnish supporting documentation in respect of any of the above, should the same be required.

In view of the clarifications provided above and all the information and documents furnished in our application, we respectfully request you to kindly consider and approve our application for registration as a Brand Owner at the earliest. We remain available to provide any further information or clarification that may be required, and sincerely thank the authority for its consideration.

Thanking you,
Yours faithfully,
For {{OrganizationName}}

__________________________
({{AuthorizedPersonName}})
{{Designation}}
Mobile: {{Mobile}}    Email: {{Email}}
Seal:`;

const largeEntityText = `[ COMPANY LETTERHEAD ]
{{OrganizationName}}
(Trading as: {{TradeName}})
{{RegisteredAddress}}

Date: {{Date}}

To,
The Competent Authority,
Central Pollution Control Board,
(EPR Registration – Plastic Waste Management)
Submitted via CPCB Centralised EPR Portal

Subject: Self-Declaration of Non-MSME (Large Enterprise) Status — Application for Registration as Brand Owner under the Plastic Waste Management Rules, 2016.

Respected Sir/Madam,

We, {{OrganizationName}} (PAN: {{CompanyPAN}}), hereby declare that our enterprise does not qualify as a Micro, Small or Medium Enterprise (MSME) under the revised classification criteria notified vide Notification No. S.O. 1364(E) dated 21 March 2025 (effective 1 April 2025) under the Micro, Small and Medium Enterprises Development Act, 2006, and accordingly falls within the category of a Large Enterprise.

This declaration is furnished for the purpose of our registration as a Brand Owner under the Plastic Waste Management Rules, 2016. The information stated above is true and correct to the best of our knowledge and belief.

We request you to kindly take the above on record.

Yours faithfully,
For {{OrganizationName}}

__________________________
Name: {{AuthorizedPersonName}}
Designation: {{Designation}}
Place: {{Place}}
Date: {{Date}}
(Authorised Signatory / Company Seal)`;

async function createDoc(fileName, text) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: buildParagraphs(text),
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join('electron/templates/part-c', fileName), buffer);
}

async function main() {
  await createDoc('brand-owner-covering-letter.docx', coverLetterText);
  await createDoc('brand-owner-self-declaration.docx', selfDeclarationText);
  await createDoc('brand-owner-large-entity.docx', largeEntityText);
}

main().catch(console.error);
