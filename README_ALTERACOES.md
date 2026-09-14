# HR/DP System - Updated Structure

## What changed

- Code and entity/table names were reorganized in English.
- Comments were kept in Portuguese to explain important implementation blocks.
- The UI was updated to a professional test layout with dashboard, sidebar and cards.
- Firebase/Firestore collections are now relational and linked by IDs.
- LocalStorage fallback was restored so the system works locally even when Firebase is offline.
- Users and screen permissions are now stored in Firestore/local fallback collections.

## Main screens

1. **Companies**
   - Companies, departments, sectors and subsectors.
   - Benefit contracts and plans by company.
   - Custom modules with dynamic columns and target screen.

2. **Records**
   - Employee documents organized by company/department/sector/subsector/employee folder path.
   - Document URL view option.
   - Custom expiration alerts with priority, recurrence and notification channels.
   - Filters for company, department, sector, subsector, employee and document.

3. **Employees**
   - Wizard flow with 4 steps.
   - Save draft and reopen drafts.
   - Editable complements and benefit tracking flags.
   - Filters for company, department, sector, subsector, status and search.

4. **Benefits**
   - Benefits separated by company and contract.
   - Provider website link.
   - Employee benefit fields based on the GVBUS Macro spreadsheet structure.
   - Absence-based discount calculation.

5. **Timekeeping**
   - Manual attendance control.
   - Seculum demo sync button prepared for API integration.
   - Absences can feed benefit calculations.

6. **Talent Bank**
   - Candidate fields based on the Banco de Talentos spreadsheet.
   - Filters for area, role, status and search.

7. **System Permissions**
   - System users linked to employees when available.
   - Screen and action permissions stored by user.

## Firestore collections

- `companies`
- `departments`
- `sectors`
- `subsectors`
- `customModules`
- `benefitContracts`
- `benefitPlans`
- `employeeBenefits`
- `employees`
- `employeeDrafts`
- `employeeDocuments`
- `documentAlerts`
- `timeRecords`
- `talentCandidates`
- `systemUsers`
- `systemPermissions`

## Validation

The project was checked with:

```bash
npm run typecheck
npm run build
```

Both commands completed successfully in this environment.
