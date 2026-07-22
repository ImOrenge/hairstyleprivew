export class LatestRequestGuard {
  private sequence = 0;

  begin() {
    this.sequence += 1;
    return this.sequence;
  }

  isCurrent(requestToken: number) {
    return requestToken === this.sequence;
  }

  invalidate() {
    this.sequence += 1;
  }
}
