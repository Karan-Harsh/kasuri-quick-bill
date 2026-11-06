/** An error meant for the person using the app: its message is shown as is, with this HTTP status. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
