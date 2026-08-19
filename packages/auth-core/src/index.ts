export {
  isValidEmail,
  isValidName,
  isValidPhone,
  normalizePhone,
  parseRoles,
  serializeRoles,
  hashPassword,
  verifyPassword,
  createUser,
  findUserByEmail,
  findUserById,
  updateUserProfile,
  updateUserPassword,
  userExists,
  grantRole,
} from './service';
export type { ProfileUpdate } from './service';
export {
  COGNITO_MANAGED_PASSWORD_HASH,
  findUserByCognitoSub,
  linkCognitoSub,
  createCognitoUser,
  findOrCreateUserByCognitoSub,
} from './cognitoMirror';
export type { CognitoMirrorOutcome, CognitoMirrorResult } from './cognitoMirror';
