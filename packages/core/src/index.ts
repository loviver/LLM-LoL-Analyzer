import dotenv from 'dotenv';
import { LeagueAssistant } from './api/LeagueAssistant';

dotenv.config();

const app = new LeagueAssistant();

app.start();