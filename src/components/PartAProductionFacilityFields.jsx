import UploadedFilePreview from './UploadedFilePreview.jsx';

export function isBrandOwnerSubApplicant(subApplicantType) {
  return /brand\s*owner/i.test(String(subApplicantType || ''));
}

export default function PartAProductionFacilityFields({
  generalInfo = {},
  autoData = {},
  inputClass = '',
  onHasProductionFacilityChange,
  onDicRegisteredChange,
  onDicDocSelect,
}) {
  const subType = generalInfo.subApplicantType || 'Importer';
  const brandOwner = isBrandOwnerSubApplicant(subType);
  const productionFacilityYes = /^yes$/i.test(String(generalInfo.hasProductionFacility || ''));
  const dicYes = /^yes$/i.test(String(generalInfo.dicRegistered || ''));

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          2 b) Does the {subType} have a Production Facility *
        </label>
        <select
          name="hasProductionFacility"
          value={
            brandOwner
              ? (/^yes$/i.test(generalInfo.hasProductionFacility) ? 'Yes' : 'No')
              : (generalInfo.hasProductionFacility || 'Not Applicable')
          }
          onChange={onHasProductionFacilityChange}
          className={inputClass}
        >
          {brandOwner ? (
            <>
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </>
          ) : (
            <option value="Not Applicable">Not Applicable</option>
          )}
        </select>
      </div>

      {brandOwner ? (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              2 c) Is the Brand Owner facility registered with the District Industries Centre of the State Government or Union territory? *
            </label>
            <select
              name="dicRegistered"
              value={dicYes ? 'Yes' : 'No'}
              onChange={onDicRegisteredChange}
              className={inputClass}
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              2 d) If Yes Upload Copy of Registration{productionFacilityYes ? ' *' : ''}
            </label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              disabled={!productionFacilityYes}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onDicDocSelect?.(file);
                e.target.value = '';
              }}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">
              Max 1 MB. PDF, PNG, JPG, JPEG. Required only when 2 b is Yes.
            </p>
            {autoData.dicRegistrationDoc ? (
              <UploadedFilePreview filePath={autoData.dicRegistrationDoc} />
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
