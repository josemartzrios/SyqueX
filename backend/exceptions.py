class DomainError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

class DictationTooLongError(DomainError):
    pass

class UnauthorizedAccessError(DomainError):
    pass

class SessionNotFoundError(DomainError):
    pass
