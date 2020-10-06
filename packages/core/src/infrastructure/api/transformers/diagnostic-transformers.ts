import { Diagnostic, DiagnosticType } from "@src/adr/domain/diagnostics";
import { DiagnosticDto } from "../types";

function getDiagnosticCode(type: DiagnosticType): string {
  const keys = Object.keys(DiagnosticType) as (keyof typeof DiagnosticType)[];
  return keys.filter((k) => DiagnosticType[k] === type)[0];
}

export function diagnosticToDto(diagnostic: Diagnostic): DiagnosticDto {
  return {
    code: getDiagnosticCode(diagnostic.type),
    severity: diagnostic.severity,
    message: `${diagnostic.type}${
      diagnostic.details ? ` (${diagnostic.details})` : ""
    }`
  };
}
