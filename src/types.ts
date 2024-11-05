import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: any; // Replace 'any' with the actual type of your user object
}