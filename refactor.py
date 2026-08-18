import re

def refactor_cpcb():
    with open('src/pages/CpcbRegistrationPage.jsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove PartB, PartC imports
    content = re.sub(r"import RegistrationPartB from '\.\./components/RegistrationPartB\.jsx';\n", "", content)
    content = re.sub(r"import RegistrationPartC from '\.\./components/RegistrationPartC\.jsx';\n", "", content)
    
    # 2. Fix registrationDummyData imports
    dummy_import_pattern = r"import \{\n  resolveRegistrationData,\n  isRegistrationReadyWithFallback,\n  REGISTRATION_DUMMY_DATA,\n  REGISTRATION_LOGIN_DUMMY,\n  resolveRegistrationLoginCredentials,\n\} from '\.\./utils/registrationDummyData\.js';"
    new_dummy_import = "import {\n  resolveRegistrationData,\n  isRegistrationReadyWithFallback,\n  resolveRegistrationLoginCredentials,\n} from '../utils/registrationDummyData.js';"
    content = re.sub(dummy_import_pattern, new_dummy_import, content)

    # 3. Remove usingDummy
    content = re.sub(r"  const \[usingDummy, setUsingDummy\] = useState\(true\);\n", "", content)
    
    # 4. Replace REGISTRATION_DUMMY_DATA
    content = re.sub(r"useState\(REGISTRATION_DUMMY_DATA\)", "useState(EMPTY_AUTO)", content)
    
    # 5. Fix applyRegistrationData
    content = re.sub(r"const \{ data, isDummy \} = resolveRegistrationData", "const { data } = resolveRegistrationData", content)
    content = re.sub(r"    setUsingDummy\(isDummy\);\n", "", content)
    content = re.sub(r"    setUsingDummy\(isDummy \|\| readyDummy\);\n", "", content)

    # 6. Remove AutoFilledPreview dummy prop
    content = re.sub(r"isDummy=\{usingDummy\}", "isDummy={false}", content)

    # 7. Remove usingDummy && tests
    content = re.sub(r"&& !usingDummy ", "", content)
    content = re.sub(r"\{usingDummy && !registrationComplete && \([\s\S]*?\)\}", "", content)
    
    # 8. Remove the MSME block 
    # Starts at: {generalInfo.typeOfCompany && (
    # Ends at: className="md:col-span-2">
    content = re.sub(r"\{generalInfo\.typeOfCompany && \([\s\S]*?className=\"md:col-span-2\">\n\s*<label.*?Registered Address Line 1", 
                     "<div className=\"md:col-span-2\">\n              <label className=\"block text-sm font-medium text-slate-700 mb-1\">Registered Address Line 1", 
                     content)

    # 9. Remove Part A Operating states & Plant details block
    # Starts at: <div className="space-y-6 mt-8 border-t pt-8">
    # Includes Part A: General Information
    # Ends right before Part B
    # Let's just remove Part B and Part C components from JSX
    content = re.sub(r"<RegistrationPartB.*?\/>", "", content)
    content = re.sub(r"<RegistrationPartC.*?\/>", "", content)
    
    # Remove Part C Document Uploads section manually
    # Let's just remove the block <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Part C: Document Uploads</h3> and its container
    part_c_pattern = r"<div className=\"space-y-6 mt-8 border-t pt-8\">\s*<div>\s*<h3 className=\"text-lg font-bold text-slate-800 border-b pb-2 mb-4\">Part C: Document Uploads</h3>[\s\S]*?<RegistrationPartC.*?\/>"
    content = re.sub(part_c_pattern, "", content)

    # We also need to remove the "New Application" button
    new_app_btn = r"<button\s+type=\"button\"\s+onClick=\{handleNewApplication\}[\s\S]*?New Application\s*</button>"
    content = re.sub(new_app_btn, "", content)

    with open('src/pages/CpcbRegistrationPage.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

def refactor_new_app():
    with open('src/pages/NewApplicationPage.jsx', 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace("export default function RegistrationForm() {", "export default function NewApplicationPage() {")

    # 2. Fix registrationDummyData imports
    dummy_import_pattern = r"import \{\n  resolveRegistrationData,\n  isRegistrationReadyWithFallback,\n  REGISTRATION_DUMMY_DATA,\n  REGISTRATION_LOGIN_DUMMY,\n  resolveRegistrationLoginCredentials,\n\} from '\.\./utils/registrationDummyData\.js';"
    new_dummy_import = "import {\n  resolveRegistrationData,\n  isRegistrationReadyWithFallback,\n  resolveRegistrationLoginCredentials,\n} from '../utils/registrationDummyData.js';"
    content = re.sub(dummy_import_pattern, new_dummy_import, content)

    # 3. Remove usingDummy
    content = re.sub(r"  const \[usingDummy, setUsingDummy\] = useState\(true\);\n", "", content)
    
    # 4. Replace REGISTRATION_DUMMY_DATA
    content = re.sub(r"useState\(REGISTRATION_DUMMY_DATA\)", "useState(EMPTY_AUTO)", content)
    
    # 5. Fix applyRegistrationData
    content = re.sub(r"const \{ data, isDummy \} = resolveRegistrationData", "const { data } = resolveRegistrationData", content)
    content = re.sub(r"    setUsingDummy\(isDummy\);\n", "", content)
    content = re.sub(r"    setUsingDummy\(isDummy \|\| readyDummy\);\n", "", content)

    # Remove Start Registration button
    start_reg_btn = r"<button\s+type=\"submit\"\s+disabled=\{loading \|\| !docReady\}[\s\S]*?Start Registration\s*</button>"
    content = re.sub(start_reg_btn, "", content)

    with open('src/pages/NewApplicationPage.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

refactor_cpcb()
refactor_new_app()
print("Refactored")
